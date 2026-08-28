
//Set up libraries
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const pool = require("./db");

//Configure shared transporter (Resend SMTP relay)
const mail_transporter = nodemailer.createTransport({
	host: "smtp.resend.com",
	port: 465,
	secure: true,
	auth: {
		user: "resend",
		pass: process.env.RESEND_API_KEY
	}
});

/**
 * Sends a transactional email through the shared Resend SMTP transporter.
 * This is the only function in the codebase that touches nodemailer directly —
 * swapping providers later means editing this function only.
 * @param {object} params
 * @param {string} params.to - Recipient email address.
 * @param {string} params.subject - Email subject line.
 * @param {string} params.html - HTML email body.
 * @param {string} [params.text] - Plain-text fallback body.
 * @returns {Promise<object>} Result from nodemailer's sendMail.
 */
async function send_email({ to, subject, html, text }){
	return mail_transporter.sendMail({
		from: process.env.MAIL_FROM_ADDRESS,
		to,
		subject,
		html,
		text
	});
}

/**
 * Creates a single-use auth token, storing only its hash, and optionally emails a
 * link built from the raw token. Shared by any feature needing a token-based email
 * flow (profile claiming, password reset, email verification, ...) — new purposes
 * need no schema change since `auth_tokens.purpose` is free-text.
 * @param {object} params
 * @param {string} params.user_id - Owning user's id.
 * @param {string} params.purpose - Token purpose (must match an allowed `auth_tokens.purpose` value).
 * @param {string} params.ttl_interval - PostgreSQL interval literal, e.g. "30 days".
 * @param {(raw_token: string) => string} params.build_link - Builds the link from the raw token.
 * @param {string} [params.email] - Recipient email, required unless `deliver` is false.
 * @param {string} [params.subject] - Email subject, required unless `deliver` is false.
 * @param {boolean} [params.deliver=true] - Whether to send the email now, or just create the token.
 * @param {import("pg").Pool|import("pg").PoolClient} [params.client=pool] - Query executor to use, e.g. a transaction client.
 * @returns {Promise<{ raw_token: string, link: string }>}
 */
async function create_and_send_token({ user_id, purpose, ttl_interval, build_link, email, subject, deliver = true, client = pool }){
	const raw_token = crypto.randomBytes(32).toString("hex");
	const token_hash = crypto.createHash("sha256").update(raw_token).digest("hex");

	await client.query(
		`INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
		 VALUES ($1, $2, $3, now() + $4::interval)`,
		[user_id, token_hash, purpose, ttl_interval]
	);

	const link = build_link(raw_token);

	if(deliver){
		await send_email({
			to: email,
			subject,
			html: `<p><a href="${link}">${subject}</a></p><p>This link will expire soon — if you didn't request this, you can ignore this email.</p>`,
			text: link
		});
	}

	return { raw_token, link };
}

/**
 * Looks up a token by its raw value and purpose, validates it, and marks it used.
 * Atomic single-statement consume — safe under concurrent requests for the same token.
 * @param {object} params
 * @param {string} params.raw_token - Raw token from the incoming request.
 * @param {string} params.purpose - Expected purpose.
 * @param {import("pg").Pool|import("pg").PoolClient} [params.client=pool] - Query executor to use, e.g. a transaction client.
 * @returns {Promise<object|null>} The matching `auth_tokens` row, or null if invalid/expired/already used.
 */
async function verify_and_consume_token({ raw_token, purpose, client = pool }){
	const token_hash = crypto.createHash("sha256").update(raw_token).digest("hex");

	const result = await client.query(
		`UPDATE auth_tokens SET used = true
		 WHERE token_hash = $1 AND purpose = $2 AND used = false AND expires_at > now()
		 RETURNING *`,
		[token_hash, purpose]
	);

	return result.rows[0] || null;
}

/**
 * Looks up a token by its raw value and purpose without marking it used.
 * Used for rendering a landing page (e.g. a claim link) where merely viewing
 * the page must not burn the token.
 * @param {object} params
 * @param {string} params.raw_token - Raw token from the incoming request.
 * @param {string} params.purpose - Expected purpose.
 * @param {import("pg").Pool|import("pg").PoolClient} [params.client=pool] - Query executor to use, e.g. a transaction client.
 * @returns {Promise<object|null>} The matching `auth_tokens` row, or null if invalid/expired/already used.
 */
async function peek_token({ raw_token, purpose, client = pool }){
	const token_hash = crypto.createHash("sha256").update(raw_token).digest("hex");

	const result = await client.query(
		`SELECT * FROM auth_tokens
		 WHERE token_hash = $1 AND purpose = $2 AND used = false AND expires_at > now()`,
		[token_hash, purpose]
	);

	return result.rows[0] || null;
}

//Export mailer functions
module.exports = {
	send_email,
	create_and_send_token,
	verify_and_consume_token,
	peek_token
};
