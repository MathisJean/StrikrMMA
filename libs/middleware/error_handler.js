const logger = require("../logger");
const { AppError } = require("../errors");

/**
 * Final catch-all for unmatched routes. Converts the miss into an AppError so
 * it flows through the same error-handling middleware as everything else.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next function.
 * @returns {void}
 */
function not_found_handler(req, res, next){
	const format = req.path.startsWith("/api") ? "json" : "html";
	next(new AppError(404, "Page not found", format));
}

/**
 * Centralized Express error-handling middleware. Every thrown/rejected error
 * in the app (sync or async, per Express 5's auto-forwarding) ends up here
 * exactly once.
 * @param {Error} err - The error passed to next(), or thrown/rejected in a handler.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next function.
 * @returns {void}
 */
function error_handler(err, req, res, next){
	const is_operational = err instanceof AppError;
	const status_code = is_operational ? err.status_code : 500;
	const message = is_operational ? err.message : "Something went wrong.";

	//Every non-AppError (a genuine bug, not a validated business-error path) still needs a
	//reasonable guess at format. Every POST/PATCH/DELETE route in this app is JSON-only, as is
	//everything under /api — only GET page routes render HTML.
	const format = is_operational
		? err.format
		: (req.path.startsWith("/api") || req.method !== "GET" ? "json" : "html");

	if(!is_operational || status_code >= 500){
		logger.error(message, err);
	}

	if(format === "json"){
		return res.status(status_code).json({ error: message });
	}

	return res.status(status_code).render("error", {
		title: "Error",
		status_code,
		message
	});
}

module.exports = { not_found_handler, error_handler };
