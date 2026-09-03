const logger = require("../logger");
const { AppError } = require("../errors");

//multer rejects uploads before any route runs; these are client mistakes, so they map to 400s.
const MULTER_MESSAGES = {
	LIMIT_FILE_SIZE: "That image is too large (5 MB maximum)",
	LIMIT_FILE_COUNT: "Too many files were uploaded",
	LIMIT_UNEXPECTED_FILE: "Unexpected file upload field"
};

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
 * Centralized error-handling middleware. Every thrown or rejected error in the app ends up
 * here exactly once, sync or async, per Express 5's auto-forwarding.
 * @param {Error} err - The error passed to next(), or thrown/rejected in a handler.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next function.
 * @returns {void}
 */
function error_handler(err, req, res, next){
	if(err?.name === "MulterError" && MULTER_MESSAGES[err.code]){
		err = new AppError(400, MULTER_MESSAGES[err.code], "json");
	}

	//body-parser sets its own exposed 4xx, but is not an AppError, so it surfaced as a 500.
	const body_status = err?.status || err?.statusCode;

	if(err?.expose === true && body_status >= 400 && body_status < 500){
		const message = err.type === "entity.too.large" ? "Request body is too large" : "Malformed request body";

		err = new AppError(body_status, message, "json");
	}

	const is_operational = err instanceof AppError;
	const status_code = is_operational ? err.status_code : 500;
	const message = is_operational ? err.message : "Something went wrong.";

	//A genuine bug still needs a format guess: only GET page routes render HTML here.
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
