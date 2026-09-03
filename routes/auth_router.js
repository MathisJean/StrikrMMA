
//Set up libraries
//`mailer` here is libs/token.js — the token helpers, not libs/mailer.js.
const { express, mailer, errors, logger, validation, require_guest, rate_limits } = require("../libs/requirements");
const router = express.Router()

//Setup Router
//require_guest is deliberately NOT applied to the whole router: the verification routes have
//to work while a stale session is still around (switching accounts, or a link clicked in a
//browser that is already signed in as someone else).

/**
 * Starts a fresh session for a resolved magic-link login. The session ID is regenerated
 * rather than reused so an attacker cannot pre-set a session ID for a victim to log into
 * (session fixation).
 * @param {import("express").Request} req - Express request object.
 * @param {{ user_id: string, is_admin: boolean }} account - Account resolved from the consumed token.
 * @returns {Promise<void>}
 */
function start_session(req, account){
	return new Promise((resolve, reject) => {
		req.session.regenerate(err => {
			if(err) return reject(err);

			req.session.user_id = account.user_id;
			//require_admin reads this off the session, so a login that only set user_id
			//would silently strip an admin of their admin rights.
			req.session.is_admin = account.is_admin;

			//The regenerated session has to be written before the response redirects, or the
			//next request arrives with a cookie the store knows nothing about.
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
 * Emails a login link and a 6-digit code for the submitted address. Handles new and
 * returning users identically — no account is created here, only when the link or code is
 * actually used, so submitting addresses cannot mint user rows.
 * @param {import("express").Request} req - Express request object. Expects `email` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/request-link", require_guest, rate_limits.request_link_ip_limit, rate_limits.request_link_email_limit, async(req, res) => {
	const email = validation.validate_email(req.body.email);

	//Delivery failures are logged but never reported: the response has to look identical
	//whether or not that address has an account, or this endpoint becomes a way to ask
	//which emails are registered.
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

		throw err;
	});

	if(account === "email_taken"){
		return res.redirect("/auth?error=email_taken");
	}

	if(!account){
		return res.redirect("/auth?error=invalid_or_expired");
	}

	await start_session(req, account);

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
