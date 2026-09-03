
//Set up libraries
//`mailer` here is libs/token.js — the token helpers, not libs/mailer.js.
const { express, mailer, errors, logger, validation, require_guest, rate_limits } = require("../libs/requirements");
const router = express.Router()

//Setup Router
//require_guest is not applied router-wide: verification must work with a stale session around.

/**
 * Starts a fresh session for a resolved login. The session ID is regenerated, not reused, so
 * an attacker cannot pre-set one for a victim to log into (session fixation).
 * @param {import("express").Request} req - Express request object.
 * @param {{ user_id: string, is_admin: boolean }} account - Account resolved from the consumed token.
 * @returns {Promise<void>}
 */
function start_session(req, account){
	return new Promise((resolve, reject) => {
		req.session.regenerate(err => {
			if(err) return reject(err);

			req.session.user_id = account.user_id;
			//require_admin reads this, so setting only user_id would silently strip admin rights.
			req.session.is_admin = account.is_admin;

			//Written before the redirect, or the next request carries a cookie the store never saw.
			req.session.save(save_err => save_err ? reject(save_err) : resolve());
		});
	});
}

/**
 * Where a freshly logged-in account belongs: onboarding until it has a username and corner,
 * their own profile afterwards.
 * @param {{ username: string|null, onboarding_complete: boolean }} account - Resolved account.
 * @returns {string} Path to redirect to.
 */
function post_login_path(account){
	if(!account.onboarding_complete || !account.username) return "/onboarding";

	return `/u/${account.username}`;
}

/**
 * GET /
 * Renders the authentication page: one email field, no password, no login/signup split.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {void}
 */
router.get("/", require_guest, (req, res) => {
	res.render("auth", {
		title: "Authentication",
		error: typeof req.query.error === "string" ? req.query.error : null
	});
});

/**
 * POST /request-link
 * Emails a login link and code for the submitted address, treating new and returning users
 * identically. No account is created until the link is used, so this cannot mint user rows.
 * @param {import("express").Request} req - Express request object. Expects `email` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/request-link", require_guest, rate_limits.request_link_ip_limit, rate_limits.request_link_email_limit, async(req, res) => {
	const email = validation.validate_email(req.body.email);

	//Logged, never reported: an identical response stops this becoming an email-registered oracle.
	await mailer.send_magic_link({ email }).catch(err => logger.error("Failed to send a login link", err));

	return res.status(200).json({ message: "Check your email for a login link." });
});

/**
 * GET /verify
 * Completes a login from a clicked magic link, then sends the user on to onboarding or
 * their profile.
 * @param {import("express").Request} req - Express request object. Expects `token` in the query string.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/verify", async(req, res) => {
	const { token } = req.query;

	if(typeof token !== "string" || token === ""){
		return res.redirect("/auth?error=missing_token");
	}

	const token_row = await mailer.verify_and_consume_token({ raw_token: token, purpose: "magic_link" });

	if(!token_row){
		return res.redirect("/auth?error=invalid_or_expired");
	}

	const account = await mailer.resolve_magic_login(token_row).catch(err => {
		if(err instanceof mailer.EmailTakenError) return "email_taken";
		if(err instanceof mailer.ClaimSupersededError) return "claim_superseded";

		throw err;
	});

	if(typeof account === "string"){
		return res.redirect(`/auth?error=${account}`);
	}

	if(!account){
		return res.redirect("/auth?error=invalid_or_expired");
	}

	//The client has a message for this, so a failed start returns to the form, not the 500 page.
	try{
		await start_session(req, account);
	}
	catch(err){
		logger.error("Failed to start a session after a magic link login", err);

		return res.redirect("/auth?error=session_error");
	}

	return res.redirect(post_login_path(account));
});

/**
 * POST /verify-code
 * Completes a login from the 6-digit code typed into the tab that requested it — the path
 * that survives an in-app browser opening the link somewhere else entirely.
 * @param {import("express").Request} req - Express request object. Expects `email` and `code` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/verify-code", rate_limits.verify_code_limit, async(req, res) => {
	const email = validation.validate_email(req.body.email);
	const code = validation.validate_code(req.body.code);

	const { row: token_row, locked_out } = await mailer.consume_magic_code({ email, code });

	if(locked_out){
		throw errors.too_many_requests("Too many attempts. Request a new code.", "json");
	}

	if(!token_row){
		throw errors.unauthorized("Invalid or expired code", "json");
	}

	const account = await mailer.resolve_magic_login(token_row).catch(err => {
		if(err instanceof mailer.EmailTakenError) throw errors.conflict(err.message, "json");
		if(err instanceof mailer.ClaimSupersededError) throw errors.conflict(err.message, "json");

		throw err;
	});

	if(!account){
		throw errors.unauthorized("Invalid or expired code", "json");
	}

	await start_session(req, account);

	return res.status(200).json({ redirect: post_login_path(account) });
});

//Export router to server file
module.exports = router
