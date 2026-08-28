
//Set up libraries
const { fs, path, express, pool, bcrypt } = require("../libs/requirements");
const mailer = require("../libs/mailer.js");
const router = express.Router();

//Setup Router

/**
 * GET /claim
 * Renders the claim landing page for a given token, without consuming it.
 * @param {import("express").Request} req - Express request object. Expects `token` in the query string.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/", async(req, res) => {
	const { token } = req.query;

	if(!token){
		return res.render("claim", { layout: "layout", title: "Claim Profile", state: "invalid", profile: null, token: "" });
	}

	try{
		const token_row = await mailer.peek_token({ raw_token: token, purpose: "profile_claim" });

		if(!token_row){
			return res.render("claim", { layout: "layout", title: "Claim Profile", state: "invalid", profile: null, token });
		}

		const profile_result = await pool.query(
			`SELECT p.*, u.claimed FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`,
			[token_row.user_id]
		);

		if(profile_result.rows.length === 0 || profile_result.rows[0].claimed){
			return res.render("claim", { layout: "layout", title: "Claim Profile", state: "already_claimed", profile: null, token });
		}

		return res.render("claim", { layout: "layout", title: "Claim Profile", state: "ready", profile: profile_result.rows[0], token });
	}
	catch(err){
		console.error("Failed to load claim page:", err);
		return res.status(500).render("error");
	}
});

/**
 * POST /claim/accept
 * Claims a profile: sets a real username/email/password/corner on the placeholder
 * user, marks it claimed, consumes the claim token, and starts a session — same
 * pattern as /auth/signup.
 * @param {import("express").Request} req - Express request object. Expects `token`, `username`, `email`, `password`, `corner` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/accept", async(req, res) => {
	const { token, username, email, password, corner } = req.body;

	if(!token || !username || !email || !password || !["red", "blue"].includes(corner)){
		return res.status(400).json({ error: "Missing or invalid fields" });
	}

	const hashed_password = await bcrypt.hash(password, 10);

	const client = await pool.connect();

	try{
		await client.query("BEGIN");

		const token_row = await mailer.verify_and_consume_token({ raw_token: token, purpose: "profile_claim", client });

		if(!token_row){
			await client.query("ROLLBACK");
			return res.status(409).json({ error: "This claim link is invalid or has expired" });
		}

		const email_check = await client.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);

		if(email_check.rows.length > 0){
			await client.query("ROLLBACK");
			return res.status(409).json({ error: "Email already registered" });
		}

		const username_check = await client.query(`SELECT id FROM users WHERE LOWER(username) = LOWER($1)`, [username]);

		if(username_check.rows.length > 0){
			await client.query("ROLLBACK");
			return res.status(409).json({ error: "Username already registered" });
		}

		const user_result = await client.query(
			`UPDATE users SET username = $1, email = $2, password_hash = $3, corner = $4, claimed = true
			 WHERE id = $5 AND claimed = false
			 RETURNING id`,
			[username, email, hashed_password, corner, token_row.user_id]
		);

		if(user_result.rows.length === 0){
			await client.query("ROLLBACK");
			return res.status(409).json({ error: "This profile was already claimed" });
		}

		await client.query("COMMIT");

		req.session.user_id = user_result.rows[0].id;
		req.session.is_admin = false;

		return res.status(200).json({ success: true, username });
	}
	catch(err){
		await client.query("ROLLBACK");
		console.error("Failed to accept claim:", err);
		return res.status(500).json({ error: "Server error" });
	}
	finally{
		client.release();
	}
});

/**
 * POST /claim/decline
 * Declines a claim: hard-deletes the placeholder profile (cascading through
 * profiles/records/auth_tokens). No consent basis exists to retain the data
 * once the real athlete says it isn't them.
 * @param {import("express").Request} req - Express request object. Expects `token` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/decline", async(req, res) => {
	const { token } = req.body;

	if(!token){
		return res.status(400).json({ error: "Missing token" });
	}

	const client = await pool.connect();

	try{
		await client.query("BEGIN");

		const token_row = await mailer.verify_and_consume_token({ raw_token: token, purpose: "profile_claim", client });

		if(!token_row){
			await client.query("ROLLBACK");
			return res.status(404).json({ error: "This claim link is invalid or has expired" });
		}

		await client.query(`DELETE FROM users WHERE id = $1 AND claimed = false`, [token_row.user_id]);

		await client.query("COMMIT");
		return res.status(200).json({ success: true });
	}
	catch(err){
		await client.query("ROLLBACK");
		console.error("Failed to decline claim:", err);
		return res.status(500).json({ error: "Server error" });
	}
	finally{
		client.release();
	}
});

//Export router to server file
module.exports = router;
