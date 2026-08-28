
//Set up libraries
const { express, pool, fs, path } = require("../libs/requirements");
const crypto = require("crypto");
const mailer = require("../libs/mailer.js");
const router = express.Router();

//Setup Router

/**
 * Middleware requiring an authenticated session with is_admin set.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next function.
 * @returns {void}
 */
function require_admin(req, res, next){
	if(!req.session.user_id || !req.session.is_admin){
		return res.status(404).render("error", {
			title: "Error",
		});
	}
	next();
}

router.use(require_admin);

/**
 * POST /admin/profiles
 * Creates an unclaimed placeholder profile (users + profiles + records rows) for
 * an athlete to claim later. Corner defaults to "red" as a placeholder — the real
 * value is chosen by the athlete when they claim the profile.
 * @param {import("express").Request} req - Express request object. Expects `first_name` and `last_name` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/profiles", async(req, res) => {
	const { first_name, last_name } = req.body;

	if(!first_name?.trim() || !last_name?.trim()){
		return res.status(400).json({ error: "first_name and last_name are required" });
	}

	const client = await pool.connect();

	try{
		await client.query("BEGIN");
		
        const user_result = await client.query(
            `INSERT INTO users (username, corner, claimed) 
             VALUES ('user-' || substr(md5(gen_random_uuid()::text), 1, 12), $1, $2) 
             RETURNING id, username`,
            ['red', false]
        );
        
        const { id: user_id, username } = user_result.rows[0];

        const profile_result = await client.query(
            `INSERT INTO profiles (user_id, first_name, last_name) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id`,
            [user_id, first_name.trim(), last_name.trim()]
        );

        const profile_id = profile_result.rows[0].id;

        await client.query(
            `INSERT INTO records (profile_id) VALUES ($1)`,
            [profile_id]
        );

        await client.query("COMMIT");

        return res.status(201).json({ 
            user_id, 
            profile_id, 
            username 
        });
	}
	catch(err){
		await client.query("ROLLBACK");
		console.error("Failed to create unclaimed profile:", err);
		return res.status(500).json({ error: "Server error" });
	}
	finally{
		client.release();
	}
});

/**
 * POST /admin/profiles/:user_id/claim-link
 * Generates (or regenerates, e.g. after expiry) a claim link for an unclaimed
 * placeholder profile. The link is returned for manual delivery, not emailed —
 * no real email exists on file for a placeholder account yet.
 * @param {import("express").Request} req - Express request object. Expects `user_id` route param.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/profiles/:user_id/claim-link", async(req, res) => {
	const { user_id } = req.params;

	try{
		const user_check = await pool.query(`SELECT id, claimed FROM users WHERE id = $1`, [user_id]);

		if(user_check.rows.length === 0){
			return res.status(404).json({ error: "User not found" });
		}

		if(user_check.rows[0].claimed){
			return res.status(409).json({ error: "Profile is already claimed" });
		}

		const { link } = await mailer.create_and_send_token({
			user_id,
			purpose: "profile_claim",
			ttl_interval: "30 days",
			build_link: raw_token => `${process.env.APP_BASE_URL}/claim?token=${raw_token}`,
			deliver: false
		});

		return res.status(201).json({ claim_url: link });
	}
	catch(err){
		console.error("Failed to generate claim link:", err);
		return res.status(500).json({ error: "Server error" });
	}
});

//Export router to server file
module.exports = router;
