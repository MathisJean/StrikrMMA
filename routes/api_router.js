//Set up libraries
const { fs, path, express, pool, upload_cloudinary_image, delete_cloudinary_image } = require("../libs/requirements");
const router = express.Router();

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

let profile_picture_url = undefined;

const EDITABLE_FIELDS = {
	profiles: [
		"nickname", "stance", "team", "hometown",
		"walkout_song", "walkout_song_artist",
		"profile_picture_url", "profile_banner_url", "instagram_url",
		"height_feet", "height_inches"
	],
	records: [
		"wins", "losses", "draws", "no_contests", "ko", "submissions"
	]
};

/**
 * Applies an allow-listed set of field updates to a single-row table, handling
 * file-field uploads/removals through Cloudinary and cleaning up replaced media.
 * @param {import("pg").PoolClient} client - Active transaction client.
 * @param {string} table_name - Table to update. Must be a key of EDITABLE_FIELDS.
 * @param {string} where_column - Column used to locate the row.
 * @param {string} where_value - Value matched against where_column.
 * @param {object} fields - Incoming field values keyed by column name.
 * @param {import("express").Request} req - Express request object, used to read uploaded files.
 * @returns {Promise<void>}
 */
async function update_simple_table(client, table_name, where_column, where_value, fields, req){
	const allowed_keys = Object.keys(fields).filter(key =>
		EDITABLE_FIELDS[table_name]?.includes(key)
	);

	if(allowed_keys.length === 0) return;

	const column_values = {};
	const deletion_urls = [];

	for(const key of allowed_keys){
		let value = fields[key];

		if(value !== "" && value !== null && !isNaN(value) && typeof value !== "object"){
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
			if(key === "profile_picture_url") profile_picture_url = value;
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

/**
 * Replaces a profile's weight classes with the given set of entries.
 * @param {import("pg").PoolClient} client - Active transaction client.
 * @param {string} profile_id - Profile the weight classes belong to.
 * @param {{ name: string, gender: string }[]} entries - Weight classes to assign.
 * @returns {Promise<void>}
 */
async function update_weight_classes(client, profile_id, entries){
	await client.query(`DELETE FROM profile_weight_classes WHERE profile_id = $1`, [profile_id]);

	for(const { name, gender } of entries){
		const wc = await client.query(
			`SELECT id FROM weight_classes WHERE name = $1 AND gender = $2`,
			[name, gender]
		);
		if(wc.rows.length > 0){
			await client.query(
				`INSERT INTO profile_weight_classes(profile_id, weight_class_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
				[profile_id, wc.rows[0].id]
			);
		}
	}
}

/**
 * Replaces a profile's martial arts with the given set of entries.
 * @param {import("pg").PoolClient} client - Active transaction client.
 * @param {string} profile_id - Profile the martial arts belong to.
 * @param {{ name: string }[]} entries - Martial arts to assign.
 * @returns {Promise<void>}
 */
async function update_martial_arts(client, profile_id, entries){
	const names = entries.map(e => e.name).filter(Boolean);

	await client.query(`DELETE FROM profile_martial_arts WHERE profile_id = $1`, [profile_id]);

	for(const name of names){
		const ma = await client.query(`SELECT id FROM martial_arts WHERE name = $1`, [name]);
		if(ma.rows.length > 0){
			await client.query(
				`INSERT INTO profile_martial_arts(profile_id, martial_art_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
				[profile_id, ma.rows[0].id]
			);
		}
	}
}

/**
 * Replaces a profile's tags with the given set of entries, preserving order.
 * @param {import("pg").PoolClient} client - Active transaction client.
 * @param {string} profile_id - Profile the tags belong to.
 * @param {{ tag_text: string }[]} entries - Tags to assign, in display order.
 * @returns {Promise<void>}
 */
async function update_tags(client, profile_id, entries){
	await client.query(`DELETE FROM tags WHERE profile_id = $1`, [profile_id]);

	for(let i = 0; i < entries.length; i++){
		const text = entries[i]?.tag_text?.trim();
		if(text){
			await client.query(
				`INSERT INTO tags(profile_id, tag_text, sort_order) VALUES($1, $2, $3)`,
				[profile_id, text, i]
			);
		}
	}
}

/**
 * Replaces a profile's awards with the given set of entries.
 * @param {import("pg").PoolClient} client - Active transaction client.
 * @param {string} profile_id - Profile the awards belong to.
 * @param {{ title: string, description?: string }[]} entries - Awards to assign.
 * @returns {Promise<void>}
 */
async function update_awards(client, profile_id, entries){
	await client.query(`DELETE FROM awards WHERE profile_id = $1`, [profile_id]);

	for(const entry of entries){
		const title = entry?.title?.trim();
		if(title){
			await client.query(
				`INSERT INTO awards(profile_id, title, description) VALUES($1, $2, $3)`,
				[profile_id, title, entry.description?.trim() || null]
			);
		}
	}
}

//Setup Router

/**
 * PATCH /update/profile
 * Applies a batch of profile/record/collection updates for the caller's own profile, inside a transaction.
 * @param {import("express").Request} req - Express request object. Expects a `json` field describing the update groups, plus optional uploaded files.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.patch("/update/profile", upload.any(), async(req, res) => {
	if(!req.session.user_id){
		return res.status(401).json({ error: "No active session" });
	}

	const client = await pool.connect();

	try{
		const data = JSON.parse(req.body.json);
		const id = data.id;
		let is_owner = false;

		if(req.session.is_admin){
			const profiles = await client.query(`SELECT id FROM profiles WHERE id = $1`, [id]);

			if(profiles.rows.length === 0){
				return res.status(404).json({ error: "Profile not found" });
			}
		}
		else{
			const profiles = await client.query(
				`SELECT id FROM profiles WHERE id = $1 AND user_id = $2`,
				[id, req.session.user_id]
			);

			if(profiles.rows.length === 0){
				return res.status(403).json({ error: "Not authorized to edit this profile" });
			}

			is_owner = true;
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
					await update_weight_classes(client, id, data.profile_weight_classes || []);
					break;

				case "profile_martial_arts":
					await update_martial_arts(client, id, data.profile_martial_arts || []);
					break;

				case "tags":
					await update_tags(client, id, data.tags || []);
					break;

				case "awards":
					await update_awards(client, id, data.awards || []);
					break;

				default:
					console.warn(`Unknown update group received: ${group}`);
			}
		}

		await client.query("COMMIT");
		return res.status(200).json({ success: true, profile_picture_url: profile_picture_url, is_owner });
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

/**
 * DELETE /delete-account
 * Permanently deletes the caller's account (cascading through their profiles and related
 * data), destroys their session, and cleans up any associated Cloudinary media.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.delete("/delete-account", async(req, res) => {
	if(!req.session.user_id){
		return res.status(401).json({ error: "No active session" });
	}

	try{
		const profile = await pool.query(
			`SELECT id, profile_picture_url, profile_banner_url FROM profiles WHERE user_id = $1`,
			[req.session.user_id]
		);

		const profile_id = profile.rows.map(p => p.id);

		const highlights = profile_id.length > 0 ? await pool.query(`SELECT video_url FROM highlights WHERE profile_id = ANY($1)`, [profile_id]) : { rows: [] };

		const media_urls = [...profile.rows.flatMap(p => [p.profile_picture_url, p.profile_banner_url]), ...highlights.rows.map(h => h.video_url)].filter(Boolean);

		await pool.query(`DELETE FROM users WHERE id = $1`, [req.session.user_id]);

		req.session.destroy(err => {
			if(err){
				console.error("Failed to destroy session after account deletion:", err);
				return res.status(500).json({ error: "Failed to complete account deletion" });
			}

			res.clearCookie("connect.sid");
			res.status(200).json({ success: true });

			media_urls.forEach(url => {
				delete_cloudinary_image(url).catch(err => {
					console.error("Orphaned media cleanup failed:", err);
				});
			});
		});
	}
	catch(err){
		console.error("Failed to delete account:", err);
		return res.status(500).json({ error: "Server error" });
	}
});

/**
 * POST /logout
 * Destroys the caller's session and clears the session cookie.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {void}
 */
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

/**
 * GET /athletes
 * Searches and paginates athlete profiles, optionally filtered by a free-text search term.
 * @param {import("express").Request} req - Express request object. Accepts `limit`, `page`, and `search` query params.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/athletes", async(req, res) => {
	const limit = Math.min(parseInt(req.query.limit) || 20, 50);
	const page = Math.max(parseInt(req.query.page) || 1, 1);
	const offset = limit * (page - 1);

	const search = req.query.search?.trim();
	const escape_like = (str) => str.replace(/[%_]/g, "\\$&");

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
		else if(search === "*"){
			query = `${base_select} ORDER BY RANDOM() LIMIT $1;`;
			values = [limit];
		}
		else{
			const words = search.split(/\s+/);
			const conditions = words.map((_, i) => `
			  (p.first_name ILIKE $${i + 1} OR p.last_name ILIKE $${i + 1} OR p.nickname ILIKE $${i + 1} OR u.username ILIKE $${i + 1})
			`).join(" AND ");

			values = words.map(w => `%${escape_like(w)}%`);
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
