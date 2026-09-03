
const errors = require('../errors.js');

/**
 * Middleware requiring an authenticated session with is_admin set. Answers a page request
 * with the rendered error page and a fetch with JSON, so an admin router serving both
 * doesn't hand a JSON caller an HTML body it can't parse. Reports "not found" rather than
 * "forbidden" so the admin surface isn't advertised to anyone who probes for it.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next function.
 * @returns {void}
 */
function require_admin(req, res, next){
	if(!req.session?.user_id || !req.session.is_admin){
		throw errors.not_found("Page not found", req.method === "GET" ? "html" : "json");
	}
	next();
}

/**
 * Middleware requiring a session.
 * @param {"json"|"html"} [format="html"] - Response format used if the check fails.
 * @returns {import("express").RequestHandler}
 */
function require_login(format = "html"){
	return function(req, res, next){
		if(!req.session?.user_id){
			throw errors.unauthorized("You must be logged in", format);
		}
		next();
	};
}

/**
 * Middleware requiring no session.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next function.
 * @returns {void}
 */
function require_guest(req, res, next){
	if(req.session?.user_id){
		//Onboarding is the one place a logged-in guest still belongs: they have a session but
		//no username yet, so the profile redirect below has nowhere to send them.
		if(res.locals.user && !res.locals.user.onboarding_complete){
			return res.redirect("/onboarding");
		}

		//A session can outlive the row it points at (deleted account, or a failed lookup in
		//user_session), which leaves res.locals.user null — reading through it threw here.
		if(res.locals.user?.username){
			return res.redirect(`/u/${res.locals.user.username}`);
		}

		return res.redirect("/home");
	}
	next();
}

//Paths a half-onboarded user must still reach: the flow itself, the auth routes that got
//them here (and let them start over), and logging out. Everything else has no meaning for
//an account with no username, corner, profile or record yet.
const ONBOARDING_EXEMPT_PREFIXES = ["/onboarding", "/auth", "/api/logout", "/api/username-availability"];

/**
 * Middleware that pins a user who has not finished onboarding to the onboarding flow.
 * Without it, a session created by a magic link lands on pages that read a username, corner,
 * profile and record that do not exist yet.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next function.
 * @returns {void}
 */
function require_onboarding(req, res, next){
	if(!req.session?.user_id || !res.locals.user || res.locals.user.onboarding_complete){
		return next();
	}

	if(ONBOARDING_EXEMPT_PREFIXES.some(prefix => req.path === prefix || req.path.startsWith(`${prefix}/`))){
		return next();
	}

	//A fetch cannot follow a redirect into an HTML page usefully, so tell it plainly.
	if(req.path.startsWith("/api") || req.method !== "GET"){
		throw errors.forbidden("Finish setting up your account first", "json");
	}

	return res.redirect("/onboarding");
}

module.exports = {
	require_admin,
	require_login,
	require_guest,
	require_onboarding
}