
/**
 * Operational error carrying an HTTP status code and a response format.
 * Thrown from routes/middleware; caught centrally by the error-handling middleware.
 */
class AppError extends Error{
	/**
	 * @param {number} status_code - HTTP status code to respond with.
	 * @param {string} message - Safe-to-expose message shown to the client.
	 * @param {"json"|"html"} [format="json"] - Response format: JSON error body for API/fetch call sites, or the rendered error page for full-page navigations.
	 */
	constructor(status_code, message, format = "json"){
		super(message);
		this.status_code = status_code;
		this.format = format;
		this.is_operational = true;
	}
}

/**
 * @param {string} message - Safe-to-expose message shown to the client.
 * @param {"json"|"html"} [format] - Response format.
 * @returns {AppError}
 */
function bad_request(message, format){
	return new AppError(400, message, format);
}

/**
 * @param {string} message - Safe-to-expose message shown to the client.
 * @param {"json"|"html"} [format] - Response format.
 * @returns {AppError}
 */
function unauthorized(message, format){
	return new AppError(401, message, format);
}

/**
 * @param {string} message - Safe-to-expose message shown to the client.
 * @param {"json"|"html"} [format] - Response format.
 * @returns {AppError}
 */
function forbidden(message, format){
	return new AppError(403, message, format);
}

/**
 * @param {string} message - Safe-to-expose message shown to the client.
 * @param {"json"|"html"} [format] - Response format.
 * @returns {AppError}
 */
function not_found(message, format){
	return new AppError(404, message, format);
}

/**
 * @param {string} message - Safe-to-expose message shown to the client.
 * @param {"json"|"html"} [format] - Response format.
 * @returns {AppError}
 */
function conflict(message, format){
	return new AppError(409, message, format);
}

/**
 * @param {string} message - Safe-to-expose message shown to the client.
 * @param {"json"|"html"} [format] - Response format.
 * @returns {AppError}
 */
function too_many_requests(message, format){
	return new AppError(429, message, format);
}

/**
 * @param {string} message - Safe-to-expose message shown to the client.
 * @param {"json"|"html"} [format] - Response format.
 * @returns {AppError}
 */
function server_error(message, format){
	return new AppError(500, message, format);
}

module.exports = {
	AppError,
	bad_request,
	unauthorized,
	forbidden,
	not_found,
	conflict,
	too_many_requests,
	server_error
};
