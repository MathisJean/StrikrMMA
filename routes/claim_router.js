
//Set up libraries
//`mailer` here is libs/token.js — the token helpers. libs/mailer.js only exports send_email,
//so requiring that directly left peek_token/verify_and_consume_token undefined.
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
 * Accepts the athlete's email on a claim they said is theirs, and emails them an ordinary
 * magic link for the placeholder account.
 *
 * This is deliberately a two-token handoff. The claim token only proves the holder is
 * authorised to answer a claim offer for this profile — it proves nothing about who owns the
 * address typed in afterwards. Letting the claim token set the email and start a session
 * would mean anyone who came across a forwarded claim link could point the profile at an
 * address they control and log in as that athlete. The magic link sent here is what actually
 * proves the address, and it logs in through the normal /auth/verify path.
 * @param {import("express").Request} req - Express request object. Expects `token` and `email` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/start", rate_limits.request_link_ip_limit, rate_limits.request_link_email_limit, async(req, res) => {
	const { token } = req.body;

	if(!token) throw errors.bad_request("Missing claim token");

	const email = validation.validate_email(req.body.email);

	//The claim token is only peeked, not consumed: the claim is not finished until the
	//emailed link is clicked, and burning it here would strand anyone who mistyped their
	//address on the previous step.
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

	//The address deliberately is NOT written onto the placeholder here. It rides on the
	//magic-link token instead, and only lands on the row once the emailed link is actually
	//clicked (see resolve_magic_login) — so nothing about this account changes until the
	//address is proven, and a failed send leaves no trace behind.
	try{
		await mailer.send_magic_link({ email, user_id: token_row.user_id });
	}
	catch(err){
		logger.error("Failed to send a claim login link", err);

		//Unlike /auth/request-link, this one reports the failure: the athlete is mid-flow and
		//waiting on that email, so silently pretending it was sent would just strand them.
		throw errors.server_error("We couldn't send that email. Please check the address and try again.");
	}

	return res.status(200).json({ message: "Check your email for a login link." });
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
