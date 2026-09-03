
//Set up libraries
const rateLimit = require("express-rate-limit");

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

//JSON body (every limited endpoint is called by fetch) and standard RateLimit headers only.
const BASE_OPTIONS = {
	standardHeaders: "draft-7",
	legacyHeaders: false
};

/**
 * Builds a limiter keyed on the client IP. `keyGenerator` is left at the default on purpose —
 * a hand-rolled `req => req.ip` skips the library's IPv6 subnet normalisation.
 * @param {object} params
 * @param {number} params.window_ms - Window length in milliseconds.
 * @param {number} params.limit - Requests allowed per window.
 * @param {string} params.message - Error message returned once the limit is hit.
 * @returns {import("express").RequestHandler}
 */
function ip_limiter({ window_ms, limit, message }){
	return rateLimit({
		...BASE_OPTIONS,
		windowMs: window_ms,
		limit,
		message: { error: message }
	});
}

//An unlimited request-link endpoint is a tool for flooding a third party's inbox.
const request_link_ip_limit = ip_limiter({
	window_ms: FIFTEEN_MINUTES,
	limit: 5,
	message: "Too many requests. Please try again later."
});

//Stricter second limit on the submitted address: IPs rotate cheaply, the target inbox does not.
const request_link_email_limit = rateLimit({
	...BASE_OPTIONS,
	windowMs: FIFTEEN_MINUTES,
	limit: 3,
	//Not an IP key, so an unparseable body falls back to one shared bucket rather than skipping the limit.
	keyGenerator: (req) => (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "invalid"),
	message: { error: "Too many login links requested for that address. Please try again later." }
});

//High enough for typos, low enough that guessing 6 digits is hopeless beside the per-token cap.
const verify_code_limit = ip_limiter({
	window_ms: FIFTEEN_MINUTES,
	limit: 8,
	message: "Too many attempts. Please try again later."
});

//Deletion mail goes to the account's own address, so this stops a hijacked session flooding it.
const deletion_request_limit = ip_limiter({
	window_ms: ONE_HOUR,
	limit: 3,
	message: "Too many deletion requests. Please try again later."
});

//Sized to slow scraping while clearing normal search use; a shared NAT counts as one client.
const public_read_limit = ip_limiter({
	window_ms: FIFTEEN_MINUTES,
	limit: 300,
	message: "Too many requests. Please slow down."
});

module.exports = {
	request_link_ip_limit,
	request_link_email_limit,
	verify_code_limit,
	deletion_request_limit,
	public_read_limit
};
