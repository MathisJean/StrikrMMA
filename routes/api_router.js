//Set up libraries
const { fs, path, express, pool, cloudinary } = require('../libs/requirements');
const router = express.Router();

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

let profile_picture_url = undefined;

function upload_cloudinary_image(fileBuffer){
	if(!fileBuffer) return;

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
			{ folder: 'strikr/profiles' },
			(error, result) => {
                if(error) reject(error);
                else resolve(result);
            }
        );
        stream.end(fileBuffer);
    });
}

async function delete_cloudinary_image(imageUrl){
    if(!imageUrl) return;

    try{
        const parts = imageUrl.split('/upload/');
        if(parts.length < 2) return;

        let path = parts[1];

        if(!path.startsWith('v') && path.includes('/')){
            path = path.substring(path.indexOf('/') + 1);
        }

        //2. Remove version prefix(e.g., v1234567890/)
        const publicIdWithExtension = path.replace(/^v\d+\//, '');

        //3. Remove file extension(.jpg, .png, etc.)
        const publicId = publicIdWithExtension.substring(0, publicIdWithExtension.lastIndexOf('.'));

        //Delete from Cloudinary
        const result = await cloudinary.uploader.destroy(publicId);
        return result;
    } 
    catch(err){
        console.error('Failed to delete image from Cloudinary:', err);
    }
}

const EDITABLE_FIELDS = {
    profiles: [
        "nickname", "stance", "team", "hometown",
        "walkout_song", "walkout_song_artist",
        "profile_picture_url", "instagram_url",
        "height_feet", "height_inches"
    ],
    records: [
        "wins", "losses", "draws", "no_contests", "ko", "submissions"
    ]
};

async function update_simple_table(client, table_name, where_column, where_value, fields, req){
    const allowed_keys = Object.keys(fields).filter(key =>
        EDITABLE_FIELDS[table_name]?.includes(key)
    );

    if(allowed_keys.length === 0) return;

    const column_values = {};
    const deletion_urls = [];

    for(const key of allowed_keys){
        let value = fields[key];

        if(value !== "" && value !== null && !isNaN(value) && typeof value !== 'object'){
            value = Number(value);
        }

        const uploaded_file = req.files?.find(f => f.fieldname === key);
        const is_file_field = uploaded_file || value === null || value === "";

        if(is_file_field){
            const { rows } = await client.query(
                `SELECT ${key} FROM ${table_name} WHERE ${where_column} = $1`,
                [where_value]
            );

            const old_url = rows[0]?.[key];
            if(old_url){
                deletion_urls.push(old_url);
            }

            if(uploaded_file){
                try{
                    const result = await upload_cloudinary_image(uploaded_file.buffer);
                    value = result.secure_url;
                }
                catch(err){
                    console.error(`Failed to upload media for field ${key}:`, err);
                    continue;
                }
            }
            else{
                value = null;
            }

            column_values[key] = value;
			profile_picture_url = value;
            continue;
        }

        if(key === "height_feet" || key === "height_inches"){
            column_values._pending_height_part = column_values._pending_height_part || {};
            column_values._pending_height_part[key] = value;
            continue;
        }

        column_values[key] = value;
    }

    if(column_values._pending_height_part){
        const feet = parseInt(column_values._pending_height_part.height_feet, 10) || 0;
        const inches = parseInt(column_values._pending_height_part.height_inches, 10) || 0;
        column_values.height = (feet * 12) + inches;
        delete column_values._pending_height_part;
    }

    const keys = Object.keys(column_values);
    if(keys.length === 0) return;

    const set_clauses = keys.map((key, i) => `${key} = $${i + 1}`);
    const values = keys.map(key => column_values[key]);
    values.push(where_value);

    //Execute Database Update
    await client.query(
        `UPDATE ${table_name} SET ${set_clauses.join(", ")}, updated_at = now() WHERE ${where_column} = $${values.length}`,
        values
    );

    //Clean up replaced or removed media files asynchronously
    deletion_urls.forEach(url => {
        if(url && !Object.values(column_values).includes(url)){
            delete_cloudinary_image(url).catch(err => {
                console.error("Orphaned image cleanup failed:", err);
            });
        }
    });
}

async function updateWeightClasses(client, profileId, entries){
    await client.query("DELETE FROM profile_weight_classes WHERE profile_id = $1", [profileId]);

    for(const { name, gender } of entries){
        const wc = await client.query(
            "SELECT id FROM weight_classes WHERE name = $1 AND gender = $2",
            [name, gender]
        );
        if(wc.rows.length > 0){
            await client.query(
                "INSERT INTO profile_weight_classes(profile_id, weight_class_id) VALUES($1, $2) ON CONFLICT DO NOTHING",
                [profileId, wc.rows[0].id]
            );
        }
    }
}

async function updateMartialArts(client, profileId, entries){
    const names = entries.map(e => e.name).filter(Boolean);

    await client.query("DELETE FROM profile_martial_arts WHERE profile_id = $1", [profileId]);

    for(const name of names){
        const ma = await client.query("SELECT id FROM martial_arts WHERE name = $1", [name]);
        if(ma.rows.length > 0){
            await client.query(
                "INSERT INTO profile_martial_arts(profile_id, martial_art_id) VALUES($1, $2) ON CONFLICT DO NOTHING",
                [profileId, ma.rows[0].id]
            );
        }
    }
}

async function updateTags(client, profileId, entries){
    await client.query("DELETE FROM tags WHERE profile_id = $1", [profileId]);

    for(let i = 0; i < entries.length; i++){
        const text = entries[i]?.tag_text?.trim();
        if(text){
            await client.query(
                "INSERT INTO tags(profile_id, tag_text, sort_order) VALUES($1, $2, $3)",
                [profileId, text, i]
            );
        }
    }
}

async function updateAwards(client, profileId, entries){
    await client.query("DELETE FROM awards WHERE profile_id = $1", [profileId]);

    for(const entry of entries){
        const title = entry?.title?.trim();
        if(title){
            await client.query(
                "INSERT INTO awards(profile_id, title, description) VALUES($1, $2, $3)",
                [profileId, title, entry.description?.trim() || null]
            );
        }
    }
}

//Setup Router
router.patch("/update/profile", upload.any(), async(req, res) => {
    if(!req.session.user_id){
        return res.status(401).json({ error: "No active session" });
    }

	const client = await pool.connect();

    try{
        const data = JSON.parse(req.body.json);
        const id = data.id;

        const profiles = await client.query(
            "SELECT id FROM profiles WHERE id = $1 AND user_id = $2",
            [id, req.session.user_id]
        );

        if(profiles.rows.length === 0){
            return res.status(403).json({ error: "Not authorized to edit this profile" });
        }

        const groups = Object.keys(data).filter(group => group !== "id");

		await client.query("BEGIN");

        for(const group of groups){
            switch(group){
                case "profiles":
                    await update_simple_table(client, group, "id", id, data.profiles, req);
                    break;
                case "records":
                    await update_simple_table(client, group, "profile_id", id, data.records, req);
                    break;
                case "profile_weight_classes":
                    await updateWeightClasses(client, id, data.profile_weight_classes || []);
                    break;
                case "profile_martial_arts":
                    await updateMartialArts(client, id, data.profile_martial_arts || []);
                    break;
                case "tags":
                    await updateTags(client, id, data.tags || []);
                    break;
                case "awards":
                    await updateAwards(client, id, data.awards || []);
                    break;
                default:
                    console.warn(`Unknown update group received: ${group}`);
            }
        }

		await client.query("COMMIT");
        return res.status(200).json({ success: true, profile_picture_url: profile_picture_url });
    }
	catch(err){
        await client.query("ROLLBACK");
        console.error("Failed to update profile:", err);
        return res.status(500).json({ error: "Server error" });
    }
	finally{
        client.release();
    }
});

router.get("/session", async(req, res) => {
    if(!req.session.user_id){
        return res.status(401).json({ error: "No active session" });
    }

    try{
        const result = await pool.query(
            `SELECT u.id, u.username, p.profile_picture_url
             FROM users u
             LEFT JOIN profiles p ON u.id = p.user_id
             WHERE u.id = $1`,
            [req.session.user_id]
        );

        if(result.rows.length === 0){
            return res.status(404).json({ error: "User not found" });
        }

        const user = result.rows[0];

        return res.json({
            id: user.id,
            username: user.username,
            profile_picture_url: user.profile_picture_url
        });
    }
	catch(err){
        console.error(err);
        return res.status(500).json({ error: "Server error" });
    }
});

router.post("/logout", async(req, res) => {
    req.session.destroy(err => {
        if(err){
            console.log("Failed to destroy session:", err);
            return res.status(500).json({ error: "Failed to log out" });
        }
        res.clearCookie("connect.sid");
        return res.status(200).json({ success: true });
    });
});

router.get('/athletes', async(req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const offset = limit *(page - 1);

    const search = req.query.search?.trim();
    const escapeLike =(str) => str.replace(/[%_]/g, '\\$&');

    try{
        const base_select = `
            SELECT
                p.id,
                p.user_id,
                u.username,
                p.first_name,
                p.nickname,
                p.last_name,
                p.profile_picture_url,
                r.wins,
                r.losses,
                r.draws,
                r.no_contests,
                COALESCE(
                  (SELECT json_agg(wc.name)
                     FROM profile_weight_classes pwc
                     JOIN weight_classes wc ON wc.id = pwc.weight_class_id
                     WHERE pwc.profile_id = p.id),
                    '[]'
                ) AS weight_classes,
                COALESCE(
                  (SELECT json_agg(ma.name)
                     FROM profile_martial_arts pma
                     JOIN martial_arts ma ON ma.id = pma.martial_art_id
                     WHERE pma.profile_id = p.id),
                    '[]'
                ) AS martial_arts,
                COUNT(*) OVER() AS total_count
            FROM profiles p
            JOIN users u ON u.id = p.user_id
            LEFT JOIN records r ON r.profile_id = p.id
        `;

        let query, values;

        if(!search){
            query = `${base_select} ORDER BY p.last_name LIMIT $1 OFFSET $2;`;
            values = [limit, offset];
        }
		else if(search === '*'){
            query = `${base_select} ORDER BY RANDOM() LIMIT $1;`;
            values = [limit];
        }
		else{
            const words = search.split(/\s+/);
            const conditions = words.map((_, i) => `
              (p.first_name ILIKE $${i + 1} OR p.last_name ILIKE $${i + 1} OR p.nickname ILIKE $${i + 1} OR u.username ILIKE $${i + 1})
            `).join(' AND ');

            values = words.map(w => `%${escapeLike(w)}%`);
            values.push(limit, offset);

            query = `
                ${base_select}
                WHERE ${conditions}
                ORDER BY p.last_name
                LIMIT $${words.length + 1} OFFSET $${words.length + 2};
            `;
        }

        const result = await pool.query(query, values);
        const total_count = result.rows[0]?.total_count || 0;

        res.json({
            athletes: result.rows,
            total_count: parseInt(total_count)
        });
    }
	catch(err){
        console.error("Failed to fetch athletes:", err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;