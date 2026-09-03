
//Set up libraries
//`mailer` here is libs/token.js; libs/mailer.js only exports send_email.
const { express, pool, delete_cloudinary_image, errors, logger, mailer, validation, require_guest, rate_limits } = require("../libs/requirements");
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
 * POST /claim/start
 * Emails an ordinary magic link for the placeholder. A deliberate two-token handoff: the claim
 * token proves nothing about the address typed in, so only the magic link can start a session.
 * @param {import("express").Request} req - Express request object. Expects `token` and `email` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/start", rate_limits.request_link_ip_limit, rate_limits.request_link_email_limit, async(req, res) => {
	const { token } = req.body;

	if(!token) throw errors.bad_request("Missing claim token");

	const email = validation.validate_email(req.body.email);

	//Peeked, not consumed: burning it here would strand anyone who mistyped their address.
	const token_row = await mailer.peek_token({ raw_token: token, purpose: "profile_claim" });

	if(!token_row){
		throw errors.not_found("This claim link is invalid or has expired");
	}

	const claim_target = await pool.query(`SELECT claimed FROM users WHERE id = $1`, [token_row.user_id]);

	if(claim_target.rows.length === 0 || claim_target.rows[0].claimed){
		throw errors.conflict("This profile was already claimed");
	}

	const email_owner = await pool.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);

	if(email_owner.rows.length > 0 && email_owner.rows[0].id !== token_row.user_id){
		throw errors.conflict("That email already belongs to a Strikr account. Log in with it instead.");
	}

	//The address rides on the token, not the row, so nothing changes until it is proven.
	try{
		await mailer.send_magic_link({ email, user_id: token_row.user_id });
	}
	catch(err){
		logger.error("Failed to send a claim login link", err);

		//Unlike /auth/request-link this reports failure: the athlete is mid-flow waiting on it.
		throw errors.server_error("We couldn't send that email. Please check the address and try again.");
	}

	return res.status(200).json({ message: "Check your email for a login link." });
});

/**
 * POST /claim/decline
 * Declines a claim, hard-deleting the placeholder and its cascades. No consent basis exists to
 * keep the data once the athlete says it isn't them.
 * @param {import("express").Request} req - Express request object. Expects `token` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/decline", async(req, res) => {
	const { token } = req.body;

	if(!token){
		throw errors.bad_request("Missing token");
	}

	//Gathered inside the transaction, destroyed after it commits, or a rollback strands the row.
	const media_urls = await pool.with_transaction(async(client) => {
		const token_row = await mailer.verify_and_consume_token({ raw_token: token, purpose: "profile_claim", client });

		if(!token_row){
			throw errors.not_found("This claim link is invalid or has expired");
		}

		const profile = await client.query(
			`SELECT id, profile_picture_url, profile_banner_url FROM profiles WHERE user_id = $1`,
			[token_row.user_id]
		);

		//TODO: Collect highlight video_urls here once that feature ships; the table does not exist yet.
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
