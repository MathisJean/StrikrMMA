
//Set up libraries
const { fs, path, express, pool} = require('../libs/requirements');
const router = express.Router();

const multer = require("multer");

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const folder = path.join(__dirname, "..", "public", "uploads");
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        cb(null, folder);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

//Setup Router
router.patch("/update", upload.any(), async (req, res) =>{
    const data = JSON.parse(req.body.json);
    const id = data.id;
    const tables = Object.keys(data).filter(table => table !== "id");

    const client = await pool.connect();
    const old_file_paths = [];
        
    try{
        await client.query("BEGIN");

        for(const table of tables){
            const select_query = `SELECT * FROM ${table} WHERE ${table === "users" ? "id" : "user_id"} = $1`
            let old_data = await client.query(select_query, [id]);
            old_data = old_data.rows;

            const old_id = new Map();
            old_data.forEach(r => old_id.set(r.id, r));

            let deleted_ids = Array.from(old_id.keys());
            
            for(const entry of data[table]){
                const existing = old_id.get(table === "users" ? id : Number(entry.id))
                deleted_ids = deleted_ids.filter(id => id !== (table === "users" ? id : Number(entry.id)));

                if(existing){
                    for(const key of Object.keys(entry)){
                        if(!(key in existing) || entry[key] == null || key == "id") continue;
                        if(!isNaN(entry[key]) && entry[key] != '') entry[key] = Number(entry[key]);
                        
                        const file = req.files.find(f => f.fieldname === entry[key]);
                        const query = `UPDATE ${table} SET ${key} = $1, updated_at = NOW() WHERE id = $2`;
                        
                        if(file){
                            const file_path = `/uploads/${file.filename}`;
                            await client.query(query, [file_path, entry.id ? entry.id : id]);
                            
                            old_file_paths.push(existing[key]);
                        }
                        else if(entry[key] !== existing[key]){
                            await client.query(query, [entry[key], entry.id ? entry.id : id]);
                        }
                    }
                }
                else if(!existing && table === "highlights"){
                    const file = req.files.find(f => f.fieldname === entry.video_url);
                    const file_path = file ? `/uploads/${file.filename}` : null;

                    const query = `INSERT INTO highlights (user_id, video_url, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING *;`;
                    await client.query(query, [id, file_path]);
                }
                else if(!existing && table === "events"){
                    const file = req.files.find(f => f.fieldname === entry.video_url);
                    const file_path = file ? `/uploads/${file.filename}` : null;
                    const title = entry.title || null;
                    const description = entry.description || null;

                    const query = `INSERT INTO events (user_id, title, description, img_url, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *;`;
                    await client.query(query, [id, title, description, file_path]);
                }
            }

            if(deleted_ids.length > 0){
                await client.query(
                    `DELETE FROM ${table} WHERE id = ANY($1::int[]) AND user_id = $2`,
                    [deleted_ids, id]
                );
            }   
        }

        //Confirm commit
        await client.query("COMMIT");

        await Promise.all(old_file_paths.map(async (file_path) => {
            const fullPath = path.join(__dirname, "..", "public", file_path);

            if(file_path && fs.existsSync(fullPath)){
                await fs.promises.unlink(fullPath);
            }
        }));

        res.status(200).json({ status: "success", message: "Data updated successfully" });
    }
    catch(err){
        await client.query("ROLLBACK");

        res.status(500).json({ status: "error", message: err.message || "Failed to update data" });
    }
    finally{
        client.release();
    }
});

router.get("/session", async (req, res) => {
    //Check if user is logged in
    if(!req.session.user_id){
        return res.status(401).json({ error: "No active session" });
    }

    try{
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.session.user_id]);

        if(result.rows.length === 0){
            return res.status(404).json({ error: "User not found" });
        }

        const user = result.rows[0];

        return res.json({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            profile_pic_url: user.profile_pic_url
        });
    }
    catch(err){
        return res.status(500).json({ error: "Server error" });
    }
});

router.post("/logout", async (req, res) => {
    req.session.destroy(err => {
        if(err){
            console.log("Failed to destroy session:", err);
            return res.status(500).json({ error: "Failed to log out" });
        }

        //Clear the session cookie
        res.clearCookie("connect.sid");
        return res.status(200).json({ success: true });
    });
});

router.get('/athletes', async (req, res) => {
    const search = req.query.search?.trim();
    const page = req.query.page?.trim();
    const limit = req.query.limit?.trim();
    let users;
    
    if(!search){
        const query = `
        SELECT id, first_name, nickname, last_name, weight_class, profile_pic_url, wins, losses, decisions, COUNT(*) OVER() AS total_count
        FROM users
        LIMIT $1 OFFSET $2;`

        users = await pool.query(query, [limit, (limit * (page - 1))]);
    }
    else{
      const words = search.split(/\s+/); 

      const conditions = words.map((_, i) => `
        (first_name ILIKE $${i+1} OR last_name ILIKE $${i + 1} OR nickname ILIKE $${i + 1})
      `).join(' AND ');

      const values = words.map(w => `%${w}%`);
      values.push(limit, (limit * (page - 1)));

      const query = `
        SELECT id, first_name, last_name, nickname, weight_class, profile_pic_url, wins, losses, decisions, COUNT(*) OVER() AS total_count
        FROM users
        WHERE ${conditions}
        ORDER BY last_name
        LIMIT $${words.length + 1}
        OFFSET $${words.length + 2};
      `;

      users = await pool.query(query, values);
    }

    res.json({users: users.rows});
});


module.exports = router;
