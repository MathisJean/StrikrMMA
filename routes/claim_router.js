
//Set up libraries
const { fs, path, express, pool, bcrypt, delete_cloudinary_image, errors } = require("../libs/requirements");
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
function require_guest(req, res, next){
	if(req.session?.user_id){
		if(res.locals.user.username){
			return res.redirect(`/u/${res.locals.user.username}`);
		}

		return res.redirect("/home");
	}
	next();
}

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
		return res.render("claim", { layout: "layout", title: "Claim Profile", state: "invalid", profile: null, token: "" });
	}

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
		throw errors.bad_request("Missing or invalid fields");
	}

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

	await pool.with_transaction(async(client) => {
		const token_row = await mailer.verify_and_consume_token({ raw_token: token, purpose: "profile_claim", client });

		if(!token_row){
			throw errors.not_found("This claim link is invalid or has expired");
		}

		const profile = await client.query(
			`SELECT id, profile_picture_url, profile_banner_url FROM profiles WHERE user_id = $1`,
			[token_row.user_id]
		);

		const profile_id = profile.rows.map(p => p.id);

		const highlights = profile_id.length > 0 ? await client.query(`SELECT video_url FROM highlights WHERE profile_id = ANY($1)`, [profile_id]) : { rows: [] };
		const media_urls = [...profile.rows.flatMap(p => [p.profile_picture_url, p.profile_banner_url]), ...highlights.rows.map(h => h.video_url)].filter(Boolean);

		await Promise.all(media_urls.map(delete_cloudinary_image));

		await client.query(`DELETE FROM users WHERE id = $1 AND claimed = false`, [token_row.user_id]);
	});

	return res.status(200).json({ success: true });
});

//Export router to server file
module.exports = router;
