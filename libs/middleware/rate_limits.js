
//Set up libraries
const rateLimit = require("express-rate-limit");

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

//Shared shape: JSON body (every limited endpoint is called by fetch), standard RateLimit
//headers, and no legacy X-RateLimit-* duplicates.
const BASE_OPTIONS = {
	standardHeaders: "draft-7",
	legacyHeaders: false
};

/**
 * Builds a limiter that keys on the client IP. `keyGenerator` is deliberately left at the
 * default — a hand-rolled `req => req.ip` skips the library's IPv6 subnet normalisation,
 * which lets one client rotate through an address block for free.
 * @param {object} params
 * @param {number} params.window_ms - Window length in milliseconds.
 * @param {number} params.max - Requests allowed per window.
 * @param {string} params.message - Error message returned once the limit is hit.
 * @returns {import("express").RequestHandler}
 */
function ip_limiter({ window_ms, max, message }){
	return rateLimit({
		...BASE_OPTIONS,
		windowMs: window_ms,
		max,
		message: { error: message }
	});
}

//Requesting a login link sends an email to whatever address is submitted, which makes an
//unlimited endpoint a tool for flooding a third party's inbox. This is not polish — it
//ships with the endpoint itself.
const request_link_ip_limit = ip_limiter({
	window_ms: FIFTEEN_MINUTES,
	max: 5,
	message: "Too many requests. Please try again later."
});

//Second, stricter limit keyed on the submitted address rather than the caller. A determined
//abuser can rotate IPs cheaply; they cannot rotate the inbox they are trying to bury.
const request_link_email_limit = rateLimit({
	...BASE_OPTIONS,
	windowMs: FIFTEEN_MINUTES,
	max: 3,
	//Not an IP key, so the library's IPv6 handling does not apply. An unparseable body
	//falls back to a single shared bucket rather than skipping the limit entirely.
	keyGenerator: (req) => (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "invalid"),
	message: { error: "Too many login links requested for that address. Please try again later." }
});

//6 digits is a million possibilities, which is guessable without a limit. Set high enough
//to tolerate typos, low enough that brute force is hopeless alongside the per-token cap.
const verify_code_limit = ip_limiter({
	window_ms: FIFTEEN_MINUTES,
	max: 8,
	message: "Too many attempts. Please try again later."
});

//Deletion confirmations email the account's own address, so this is about stopping a
//hijacked session from burying its owner in mail, not about protecting a stranger.
const deletion_request_limit = ip_limiter({
	window_ms: ONE_HOUR,
	max: 3,
	message: "Too many deletion requests. Please try again later."
});

module.exports = {
	request_link_ip_limit,
	request_link_email_limit,
	verify_code_limit,
	deletion_request_limit
};
