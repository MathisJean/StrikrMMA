
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
		//A session can outlive the row it points at (deleted account, or a failed lookup in
		//user_session), which leaves res.locals.user null — reading through it threw here.
		if(res.locals.user?.username){
			return res.redirect(`/u/${res.locals.user.username}`);
		}

		return res.redirect("/home");
	}
	next();
}

module.exports = {
	require_admin,
	require_login,
	require_guest
}