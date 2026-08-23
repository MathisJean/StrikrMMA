
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
router.patch("/update/profile", upload.any(), async (req, res) =>{
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