
//Set up libraries
const { express, pool, mailer, errors, require_admin } = require("../libs/requirements");
const router = express.Router();

//Setup Router
router.use(require_admin);

const ALLOWED_BADGES = ["none", "founding_member", "beta_tester"];

/**
 * GET /admin
 * Renders the admin dashboard: every unclaimed placeholder profile, newest first.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/", async(req, res) => {
	const claimed_result = await pool.query(
		`SELECT u.id AS user_id, u.username, u.created_at, u.is_founding_member, u.is_beta_tester,
		        p.id AS profile_id, p.first_name, p.last_name
		 FROM users u
		 LEFT JOIN profiles p ON p.user_id = u.id
		 WHERE u.claimed = false
		 ORDER BY u.created_at DESC`
	);

	return res.render("admin", { layout: "layout", title: "Admin", placeholders: claimed_result.rows });
});

/**
 * GET /admin/reports
 * Renders every profile report with the reported/reporter ids resolved to
 * names/usernames, newest first.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/reports", async(req, res) => {
	const result = await pool.query(
		`SELECT
		   r.id, r.reason, r.status, r.created_at,
		   reported_user.username      AS reported_username,
		   reported_profile.first_name AS reported_first_name,
		   reported_profile.last_name  AS reported_last_name,
		   reporter_user.username      AS reporter_username,
		   reporter_profile.first_name AS reporter_first_name,
		   reporter_profile.last_name  AS reporter_last_name
		 FROM reports r
		 INNER JOIN profiles reported_profile ON reported_profile.id = r.reported_profile_id
		 INNER JOIN users reported_user ON reported_user.id = reported_profile.user_id
		 LEFT JOIN users reporter_user ON reporter_user.id = r.reporter_user_id
		 LEFT JOIN profiles reporter_profile ON reporter_profile.user_id = reporter_user.id
		 ORDER BY r.created_at DESC`
	);

	return res.render("admin_reports", { layout: "layout", title: "Admin — Reports", reports: result.rows });
});

/**
 * POST /admin/profiles
 * Creates an unclaimed placeholder profile (users + profiles + records rows) for
 * an athlete to claim later. Corner defaults to "red" as a placeholder — the real
 * value is chosen by the athlete when they claim the profile.
 * @param {import("express").Request} req - Express request object. Expects `first_name`, `last_name`, and optionally `badge` ("none" | "founding_member" | "beta_tester") in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/profiles", async(req, res) => {
	const { first_name, last_name, badge } = req.body;

	if(!first_name?.trim() || !last_name?.trim()){
		throw errors.bad_request("first_name and last_name are required");
	}

	const safe_badge = ALLOWED_BADGES.includes(badge) ? badge : "none";
	const is_founding_member = safe_badge === "founding_member";
	const is_beta_tester = safe_badge === "beta_tester";

	const { user_id, profile_id, username } = await pool.with_transaction(async(client) => {
		const user_result = await client.query(
			`INSERT INTO users (username, corner, claimed, is_founding_member, is_beta_tester)
			 VALUES ('user-' || substr(md5(gen_random_uuid()::text), 1, 12), $1, $2, $3, $4)
			 RETURNING id, username`,
			['red', false, is_founding_member, is_beta_tester]
		);

		const { id: user_id, username } = user_result.rows[0];

		const profile_result = await client.query(
			`INSERT INTO profiles (user_id, first_name, last_name)
			 VALUES ($1, $2, $3)
			 RETURNING id`,
			[user_id, first_name.trim(), last_name.trim()]
		);

		const profile_id = profile_result.rows[0].id;

		await client.query(
			`INSERT INTO records (profile_id) VALUES ($1)`,
			[profile_id]
		);

		return { user_id, profile_id, username };
	});

	return res.status(201).json({
		user_id,
		profile_id,
		username
	});
});

/**
 * POST /admin/profiles/:user_id/claim-link
 * Generates (or regenerates, e.g. after expiry) a claim link for an unclaimed
 * placeholder profile. The link is returned for manual delivery, not emailed —
 * no real email exists on file for a placeholder account yet.
 * @param {import("express").Request} req - Express request object. Expects `user_id` route param.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/profiles/:user_id/claim-link", async(req, res) => {
	const { user_id } = req.params;

	const user_check = await pool.query(`SELECT id, claimed FROM users WHERE id = $1`, [user_id]);

	if(user_check.rows.length === 0){
		throw errors.not_found("User not found");
	}

	if(user_check.rows[0].claimed){
		throw errors.conflict("Profile is already claimed");
	}

	const { link } = await mailer.create_and_send_token({
		user_id,
		purpose: "profile_claim",
		ttl_interval: "30 days",
		build_link: raw_token => `${process.env.APP_BASE_URL}/claim?token=${raw_token}`,
		deliver: false
	});

	return res.status(201).json({ claim_url: link });
});

/**
 * DELETE /admin/profiles/:user_id
 * Permanently deletes an unclaimed placeholder profile (cascading through
 * profiles/records/auth_tokens). Guarded to claimed = false so a real, claimed
 * account can never be deleted through this path, even under a race.
 * @param {import("express").Request} req - Express request object. Expects `user_id` route param.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.delete("/profiles/:user_id", async(req, res) => {
	const { user_id } = req.params;

	const deleted = await pool.query(
		`DELETE FROM users WHERE id = $1 AND claimed = false RETURNING id`,
		[user_id]
	);

	if(deleted.rows.length === 0){
		const check = await pool.query(`SELECT claimed FROM users WHERE id = $1`, [user_id]);

		if(check.rows.length === 0){
			throw errors.not_found("User not found");
		}

		throw errors.conflict("Cannot delete a claimed profile");
	}

	return res.status(204).send();
});

const ALLOWED_REPORT_STATUSES = ["reviewed", "dismissed"];

/**
 * PATCH /admin/reports/:id
 * Marks a report reviewed or dismissed. Both are terminal but not mutually
 * locked — re-classifying between them is harmless, unlike a delete.
 * @param {import("express").Request} req - Express request object. Expects `id` route param and `status` ("reviewed" | "dismissed") in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.patch("/reports/:id", async(req, res) => {
	const { id } = req.params;
	const { status } = req.body;

	if(!ALLOWED_REPORT_STATUSES.includes(status)){
		throw errors.bad_request("status must be 'reviewed' or 'dismissed'");
	}

	const updated = await pool.query(`UPDATE reports SET status = $1 WHERE id = $2 RETURNING id`, [status, id]);

	if(updated.rows.length === 0) throw errors.not_found("Report not found");

	return res.status(200).json({ success: true, status });
});

//Export router to server file
module.exports = router;
