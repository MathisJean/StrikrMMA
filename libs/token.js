
//Set up libraries
const { send_email } = require("./mailer");
//node: prefix so this can only ever resolve to the builtin, never a same-named package.
const crypto = require("node:crypto");
const pool = require("./db");

//Short on purpose, unlike a 30-day claim link: any longer is a credential sitting in an inbox.
const MAGIC_LINK_TTL = "15 minutes";

//Caps guesses against one pending login; the per-IP limiter is what caps them across accounts.
const MAX_CODE_ATTEMPTS = 5;

/**
 * Raised when a login's address was registered to another account in the meantime, so the
 * caller can say that rather than "expired".
 */
class EmailTakenError extends Error{
	constructor(){
		super("That email is already registered to another account");
		this.name = "EmailTakenError";
	}
}

/**
 * Raised when a claim login resolves to a profile someone else already claimed, so the link
 * must not start a session on it.
 */
class ClaimSupersededError extends Error{
	constructor(){
		super("This profile has already been claimed. Log in with the email it was claimed with.");
		this.name = "ClaimSupersededError";
	}
}

/**
 * Hashes a token or code for storage/lookup. Only ever the hash is written to the database,
 * so a leaked `auth_tokens` dump cannot be replayed as a login.
 * @param {string} value - Raw token or code.
 * @returns {string} Hex sha256 digest.
 */
function hash_value(value){
	return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Creates a single-use auth token, storing only its hash, and optionally emails a link built
 * from it. Shared by every token-based email flow.
 * @param {object} params
 * @param {string|null} [params.user_id=null] - Owning user's id, or null when the row does not exist yet (magic link for a new address).
 * @param {string} params.purpose - Token purpose (must match an allowed `auth_tokens.purpose` value).
 * @param {string} params.ttl_interval - PostgreSQL interval literal, e.g. "30 days".
 * @param {(raw_token: string) => string} params.build_link - Builds the link from the raw token.
 * @param {string} [params.email] - Recipient email, required unless `deliver` is false.
 * @param {boolean} [params.store_email=false] - Whether to record `email` on the token row, so a login can be resolved before any user row exists.
 * @param {boolean} [params.with_code=false] - Whether to also generate a 6-digit code tied to this same row.
 * @param {string} [params.subject] - Email subject, required unless `deliver` is false.
 * @param {(link: string, raw_code: string|null) => string} [params.build_html] - Overrides the default email body.
 * @param {boolean} [params.deliver=true] - Whether to send the email now, or just create the token.
 * @param {import("pg").Pool|import("pg").PoolClient} [params.client=pool] - Query executor to use, e.g. a transaction client.
 * @returns {Promise<{ raw_token: string, raw_code: string|null, link: string }>}
 */
async function create_and_send_token({ user_id = null, purpose, ttl_interval, build_link, email, store_email = false, with_code = false, subject, build_html, deliver = true, client = pool }){
	const raw_token = crypto.randomBytes(32).toString("hex");
	const token_hash = hash_value(raw_token);

	//randomInt's upper bound is exclusive, so 1000000 is what actually includes 999999.
	const raw_code = with_code ? crypto.randomInt(100000, 1000000).toString() : null;
	const code_hash = raw_code ? hash_value(raw_code) : null;

	await client.query(
		`INSERT INTO auth_tokens (user_id, token_hash, code_hash, email, purpose, expires_at)
		 VALUES ($1, $2, $3, $4, $5, now() + $6::interval)`,
		[user_id, token_hash, code_hash, store_email ? email : null, purpose, ttl_interval]
	);

	const link = build_link(raw_token);

	if(deliver){
		await send_email({
			to: email,
			subject,
			html: build_html
				? build_html(link, raw_code)
				: `<p><a href="${link}">${subject}</a></p><p>This link will expire soon. If you didn't request this, you can ignore this email.</p>`,
			text: raw_code ? `${link}\n\nOr enter this code: ${raw_code}` : link
		});
	}

	return { raw_token, raw_code, link };
}

/**
 * Emails a magic link and a 6-digit code: two ways to finish the SAME login, one token row.
 * The code covers in-app browsers, which can open a link outside the tab that started it.
 * @param {object} params
 * @param {string} params.email - Address to send the login to.
 * @param {string|null} [params.user_id=null] - Existing user row this login must resolve to, if any.
 * @param {import("pg").Pool|import("pg").PoolClient} [params.client=pool] - Query executor to use.
 * @returns {Promise<{ raw_token: string, raw_code: string|null, link: string }>}
 */
async function send_magic_link({ email, user_id = null, client = pool }){
	//Retires any pending login for this address, so a re-request leaves exactly one live link.
	await client.query(
		`UPDATE auth_tokens SET used = true
		 WHERE LOWER(email) = LOWER($1) AND purpose = 'magic_link' AND used = false`,
		[email]
	);

	return create_and_send_token({
		user_id,
		email,
		purpose: "magic_link",
		ttl_interval: MAGIC_LINK_TTL,
		store_email: true,
		with_code: true,
		subject: "Your STRIKR MMA login link",
		build_link: raw_token => `${process.env.APP_BASE_URL}/auth/verify?token=${raw_token}`,
		build_html: (link, raw_code) => `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; justify-content: center;">
				<p style="margin-top: 0; margin-bottom: 24px; text-align: center;">
					<a href="${link}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 6px;">Log in to STRIKR</a>
				</p>
				
				<p style="margin-top: 0; margin-bottom: 12px; font-size: 15px; line-height: 1.5; color: #334155; justify-self: center; text-align: center;">
					Or enter this code:
				</p>
				
				<div style="text-align: center; margin: 16px 0 24px 0;">
					<strong style="display: inline-block; font-size: 28px; font-family: monospace; letter-spacing: 4px; color: #0f172a; background-color: #f1f5f9; padding: 10px 20px; border-radius: 6px; border: 1px solid #cbd5e1;">${raw_code}</strong>
				</div>
				
				<p style="margin-bottom: 0; font-size: 13px; line-height: 1.5; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 16px;">
					This link and code expire in 15 minutes and can only be used once. If you didn't request this, you can <b>ignore this email.</b>
				</p>
			</div>
		`,
		client
	});
}

/**
 * Validates a 6-digit login code and consumes its token. The attempt is counted before the
 * code is matched, or the cap would only ever advance on a correct guess.
 * @param {object} params
 * @param {string} params.email - Address the code was sent to.
 * @param {string} params.code - Code as typed by the user.
 * @param {import("pg").Pool|import("pg").PoolClient} [params.client=pool] - Query executor to use.
 * @returns {Promise<{ row: object|null, locked_out: boolean }>} The consumed token row, or why there isn't one.
 */
async function consume_magic_code({ email, code, client = pool }){
	//send_magic_link retires the previous pending login, so at most one row can match here.
	const pending = await client.query(
		`SELECT id, user_id, email, code_hash, code_attempts FROM auth_tokens
		 WHERE LOWER(email) = LOWER($1) AND purpose = 'magic_link'
		 AND used = false AND expires_at > now()
		 ORDER BY created_at DESC LIMIT 1`,
		[email]
	);

	const token_row = pending.rows[0];

	if(!token_row) return { row: null, locked_out: false };

	//Counted in the statement that reads it, so parallel guesses cannot all pass the same stale cap.
	const attempt = await client.query(
		`UPDATE auth_tokens SET code_attempts = code_attempts + 1
		 WHERE id = $1 RETURNING code_attempts`,
		[token_row.id]
	);

	if(attempt.rows[0].code_attempts > MAX_CODE_ATTEMPTS) return { row: null, locked_out: true };

	if(!token_row.code_hash || token_row.code_hash !== hash_value(code)){
		return { row: null, locked_out: false };
	}

	//Guarded on used = false, so two tabs with the same correct code cannot both consume it.
	const consumed = await client.query(
		`UPDATE auth_tokens SET used = true WHERE id = $1 AND used = false RETURNING *`,
		[token_row.id]
	);

	return { row: consumed.rows[0] || null, locked_out: false };
}

/**
 * Resolves a consumed token into an account, creating one on a first login. In order: a
 * user_id means the claim flow, else a matching address, else a bare account for onboarding.
 * @param {object} token_row - Row returned by `verify_and_consume_token` or `consume_magic_code`.
 * @returns {Promise<{ user_id: string, is_admin: boolean, username: string|null, onboarding_complete: boolean }>}
 */
async function resolve_magic_login(token_row){
	return pool.with_transaction(async(client) => {
		if(token_row.user_id){
			//Only the claim flow sets user_id, so a claimed row or a different address means someone else got here first.
			const existing = await client.query(
				`UPDATE users SET email = COALESCE(email, $1)
				 WHERE id = $2 AND claimed = false
				 AND (email IS NULL OR LOWER(email) = LOWER($1))
				 RETURNING id, is_admin, username, onboarding_complete`,
				[token_row.email, token_row.user_id]
			).catch(err => {
				//The unique index on lower(email) settles a race with an ordinary signup.
				if(err.code === "23505") throw new EmailTakenError();

				throw err;
			});

			if(existing.rows.length === 0){
				const target = await client.query(`SELECT id FROM users WHERE id = $1`, [token_row.user_id]);

				//The account was deleted between the email being sent and the link being clicked.
				if(target.rows.length === 0) return null;

				throw new ClaimSupersededError();
			}

			const user = existing.rows[0];

			return {
				user_id: user.id,
				is_admin: user.is_admin,
				username: user.username,
				onboarding_complete: user.onboarding_complete
			};
		}

		const matched = await client.query(
			`SELECT id, is_admin, username, onboarding_complete FROM users WHERE LOWER(email) = LOWER($1)`,
			[token_row.email]
		);

		if(matched.rows.length > 0){
			const user = matched.rows[0];

			return {
				user_id: user.id,
				is_admin: user.is_admin,
				username: user.username,
				onboarding_complete: user.onboarding_complete
			};
		}

		//A first login: everything else comes from onboarding, so this row carries only the proven address.
		const created = await client.query(
			`INSERT INTO users (email, claimed, onboarding_complete)
			 VALUES ($1, true, false)
			 RETURNING id, is_admin, username, onboarding_complete`,
			[token_row.email]
		);

		const user = created.rows[0];

		return {
			user_id: user.id,
			is_admin: user.is_admin,
			username: user.username,
			onboarding_complete: user.onboarding_complete
		};
	});
}

/**
 * Looks up a token by its raw value and purpose, validates it, and marks it used.
 * Atomic single-statement consume — safe under concurrent requests for the same token.
 * @param {object} params
 * @param {string} params.raw_token - Raw token from the incoming request.
 * @param {string} params.purpose - Expected purpose.
 * @param {string} [params.user_id] - When given, the token must also belong to this user.
 * @param {import("pg").Pool|import("pg").PoolClient} [params.client=pool] - Query executor to use, e.g. a transaction client.
 * @returns {Promise<object|null>} The matching `auth_tokens` row, or null if invalid/expired/already used.
 */
async function verify_and_consume_token({ raw_token, purpose, user_id, client = pool }){
	const token_hash = hash_value(raw_token);

	const result = await client.query(
		`UPDATE auth_tokens SET used = true
		 WHERE token_hash = $1 AND purpose = $2 AND used = false AND expires_at > now()
		 AND ($3::uuid IS NULL OR user_id = $3)
		 RETURNING *`,
		[token_hash, purpose, user_id || null]
	);

	return result.rows[0] || null;
}

/**
 * Looks up a token without marking it used, for landing pages where merely viewing must not
 * burn it.
 * @param {object} params
 * @param {string} params.raw_token - Raw token from the incoming request.
 * @param {string} params.purpose - Expected purpose.
 * @param {import("pg").Pool|import("pg").PoolClient} [params.client=pool] - Query executor to use, e.g. a transaction client.
 * @returns {Promise<object|null>} The matching `auth_tokens` row, or null if invalid/expired/already used.
 */
async function peek_token({ raw_token, purpose, client = pool }){
	const token_hash = hash_value(raw_token);

	const result = await client.query(
		`SELECT * FROM auth_tokens
		 WHERE token_hash = $1 AND purpose = $2 AND used = false AND expires_at > now()`,
		[token_hash, purpose]
	);

	return result.rows[0] || null;
}

/**
 * Deletes consumed tokens and ones expired over 30 days ago. Nothing else cleans this table,
 * so it must run on a schedule (see server.js).
 * @returns {Promise<number>} Number of rows deleted.
 */
async function cleanup_expired_tokens(){
	const result = await pool.query(
		`DELETE FROM auth_tokens WHERE used = true OR expires_at < now() - interval '30 days'`
	);

	return result.rowCount;
}

//Export mailer functions
module.exports = {
	EmailTakenError,
	ClaimSupersededError,
	send_email,
	create_and_send_token,
	send_magic_link,
	consume_magic_code,
	resolve_magic_login,
	verify_and_consume_token,
	peek_token,
	cleanup_expired_tokens
};
