
const { express, pool, errors, validation, require_login } = require("../libs/requirements");
const router = express.Router();

router.use(require_login("json"));

//Setup Router

/**
 * POST /report/:id
 * Reports a profile for review. Requires an active session and a non-empty reason.
 * @param {import("express").Request} req - Express request object. Expects `id` route param (the reported profile's id) and `reason` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post('/:id', async(req, res) => {
	const { reason } = req.body;
	const reported_id = validation.validate_uuid(req.params.id, "profile id");
	const reporter_id = req.session.user_id;

	if(!reason?.trim()) throw errors.bad_request("A reason is required");

	const profile = await pool.query(`SELECT user_id FROM profiles WHERE id = $1`, [reported_id]);

	if(profile.rows.length === 0) throw errors.not_found("Profile not found");
	if(profile.rows[0].user_id === reporter_id) throw errors.forbidden("You cannot report yourself");

	//Already atomic; the unique constraint makes a repeat report a no-op rather than an error.
	await pool.query(
		`INSERT INTO reports (reported_profile_id, reporter_user_id, reason)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (reported_profile_id, reporter_user_id) DO NOTHING`,
		[reported_id, reporter_id, reason.trim()]
	);

	return res.status(201).json({ success: true });
});

//Export router to server file
module.exports = router;
