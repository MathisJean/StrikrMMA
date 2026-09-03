
const errors = require('../errors.js');

/**
 * Middleware requiring an admin session. Answers a page with HTML and a fetch with JSON, and
 * reports "not found" rather than "forbidden" so the admin surface is not advertised.
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
		//A fetch follows a redirect and reads the result as success, so a JSON caller is told plainly.
		if(req.path.startsWith("/api") || req.method !== "GET"){
			throw errors.forbidden("You are already logged in", "json");
		}

		//The one place a logged-in guest belongs: no username yet, so the redirect below has no target.
		if(res.locals.user && !res.locals.user.onboarding_complete){
			return res.redirect("/onboarding");
		}

		//A session can outlive the row it points at, leaving res.locals.user null.
		if(res.locals.user?.username){
			return res.redirect(`/u/${res.locals.user.username}`);
		}

		return res.redirect("/home");
	}
	next();
}

//Paths a half-onboarded user must still reach: the flow, auth, logout, and the deletion link.
const ONBOARDING_EXEMPT_PREFIXES = [
	"/onboarding",
	"/auth",
	"/api/logout",
	"/api/username-availability",
	"/api/request-deletion",
	"/account/confirm-deletion"
];

/**
 * Pins a half-onboarded user to the onboarding flow, which otherwise lands on pages reading a
 * username, corner, profile and record that do not exist yet.
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