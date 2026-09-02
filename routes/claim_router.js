
//Set up libraries
//`mailer` here is libs/token.js — the token helpers. libs/mailer.js only exports send_email,
//so requiring that directly left peek_token/verify_and_consume_token undefined.
const { express, pool, bcrypt, delete_cloudinary_image, errors, logger, mailer, validation, require_guest } = require("../libs/requirements");
const router = express.Router();

//Setup Router
router.use(require_guest);

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
		return res.render("claim", { layout: "layout", title: "Claim", state: "invalid", profile: null, token: "" });
	}

	const token_row = await mailer.peek_token({ raw_token: token, purpose: "profile_claim" });

	if(!token_row){
		return res.render("claim", { layout: "layout", title: "Claim", state: "invalid", profile: null, token });
	}

	const profile_result = await pool.query(
		`SELECT p.*, u.claimed FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`,
		[token_row.user_id]
	);

	if(profile_result.rows.length === 0 || profile_result.rows[0].claimed){
		return res.render("claim", { layout: "layout", title: "Claim", state: "already_claimed", profile: null, token });
	}

	return res.render("claim", { layout: "layout", title: "Claim", state: "ready", profile: profile_result.rows[0], token });
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
	const { token } = req.body;

	if(!token) throw errors.bad_request("Missing claim token");

	//Same rules as /auth/signup — a claim creates a real account, so it gets the same checks.
	const corner = validation.validate_corner(req.body.corner);
	const username = validation.validate_username(req.body.username);
	const email = validation.validate_email(req.body.email);
	const password = validation.validate_password(req.body.password);

	const hashed_password = await bcrypt.hash(password, 10);

	const user_id = await pool.with_transaction(async(client) => {
		const token_row = await mailer.verify_and_consume_token({ raw_token: token, purpose: "profile_claim", client });

		if(!token_row){
			throw errors.conflict("This claim link is invalid or has expired");
		}

		const email_check = await client.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);

		if(email_check.rows.length > 0){
			throw errors.conflict("Email already registered");
		}

		const username_check = await client.query(`SELECT id FROM users WHERE LOWER(username) = LOWER($1)`, [username]);

		if(username_check.rows.length > 0){
			throw errors.conflict("Username already registered");
		}

		const user_result = await client.query(
			`UPDATE users SET username = $1, email = $2, password_hash = $3, corner = $4, claimed = true
			 WHERE id = $5 AND claimed = false
			 RETURNING id`,
			[username, email, hashed_password, corner, token_row.user_id]
		);

		if(user_result.rows.length === 0){
			throw errors.conflict("This profile was already claimed");
		}

		return user_result.rows[0].id;
	}).catch(err => {
		//The uniqueness checks above race against a concurrent signup; the unique indexes on
		//lower(username)/lower(email) settle it, so translate their verdict into a conflict.
		if(err.code === "23505"){
			throw errors.conflict("That username or email is already registered");
		}

		throw err;
	});

	req.session.user_id = user_id;
	req.session.is_admin = false;

	return res.status(200).json({ success: true, username });
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
		throw errors.bad_request("Missing token");
	}

	//The URLs are gathered inside the transaction but destroyed only once it commits —
	//deleting first meant a rollback left a live profile pointing at missing images.
	const media_urls = await pool.with_transaction(async(client) => {
		const token_row = await mailer.verify_and_consume_token({ raw_token: token, purpose: "profile_claim", client });

		if(!token_row){
			throw errors.not_found("This claim link is invalid or has expired");
		}

		const profile = await client.query(
			`SELECT id, profile_picture_url, profile_banner_url FROM profiles WHERE user_id = $1`,
			[token_row.user_id]
		);

		//TODO: Collect highlight video_urls here too once the highlights feature ships. The
		//table does not currently exist, and querying it made every decline fail.
		const deleted = await client.query(`DELETE FROM users WHERE id = $1 AND claimed = false RETURNING id`, [token_row.user_id]);

		//Nothing was deleted, so nothing is orphaned — leave the media alone.
		if(deleted.rows.length === 0) return [];

		return profile.rows.flatMap(p => [p.profile_picture_url, p.profile_banner_url]).filter(Boolean);
	});

	await Promise.all(media_urls.map(url =>
		delete_cloudinary_image(url).catch(err => logger.error("Failed to delete media for a declined profile", err))
	));

	return res.status(200).json({ success: true });
});

//Export router to server file
module.exports = router;
