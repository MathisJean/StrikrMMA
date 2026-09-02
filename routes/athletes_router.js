
//Set up libraries
const { express, pool, errors, require_login } = require("../libs/requirements");
const router = express.Router()

//Shown when a profile somehow has no `records` row, so both views can render a zero record
//without every field needing a null guard. Rebuilt per call so a caller can't mutate it.
const empty_record = () => ({
	wins: 0,
	losses: 0,
	draws: 0,
	no_contests: 0,
	ko: 0,
	submissions: 0,
	total_fights: 0
});

//Setup Router

/**
 * GET /
 * Bare /u has no athlete to show — send visitors to the homepage rather than
 * rendering the profile view with no profile to render.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {void}
 */
router.get("/", (req, res) => res.redirect("/home"));

/**
 * GET /:username/settings
 * Renders the owner-only settings page for an athlete's profile.
 * @param {import("express").Request} req - Express request object. Expects `username` route param.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/:username/settings", require_login("html"), async(req, res) => {
	const username = req.params.username;

	const users = await pool.query(`SELECT * FROM users WHERE LOWER(username) = LOWER($1)`, [username]);

	if(users.rows.length === 0){
		throw errors.not_found("Athlete not found", "html");
	}

	const user = users.rows[0];

	const is_owner = req.session.user_id === user.id;
	const is_admin_view = Boolean(req.session.is_admin) && !is_owner;
	const is_claimed = user.claimed;

	const can_edit = is_owner || (req.session.is_admin && !is_claimed);

	if(!can_edit) throw errors.forbidden("You do not have permission to edit this profile", "html");

	const profiles = await pool.query(`SELECT * FROM profiles WHERE user_id = $1 ORDER BY created_at ASC`, [user.id]);

	if(profiles.rows.length === 0){
		throw errors.not_found("Athlete not found", "html");
	}

	const profile = profiles.rows[0];

	const tags = await pool.query(`SELECT * FROM tags WHERE profile_id = $1 ORDER BY sort_order ASC`, [profile.id]);

	const badges_result = await pool.query(`
		SELECT
			p.id,
			p.first_name,
			p.last_name,
			p.nickname,
			p.profile_picture_url,
			COALESCE(
				(SELECT json_agg(json_build_object('id', wc.id, 'name', wc.name, 'gender', wc.gender) ORDER BY wc.sort_order)
				FROM profile_weight_classes pwc
				JOIN weight_classes wc ON wc.id = pwc.weight_class_id
				WHERE pwc.profile_id = p.id),
				'[]'
			) AS weight_classes,
			COALESCE(
				(SELECT json_agg(json_build_object('id', ma.id, 'name', ma.name) ORDER BY ma.name)
				FROM profile_martial_arts pma
				JOIN martial_arts ma ON ma.id = pma.martial_art_id
				WHERE pma.profile_id = p.id),
				'[]'
			) AS martial_arts
		FROM profiles p
		WHERE p.id = $1
	`, [profile.id]);

	const badges = badges_result.rows[0];

	const weight_classes = await pool.query(`SELECT * FROM weight_classes ORDER BY sort_order ASC`);
	const martial_arts = await pool.query(`SELECT * FROM martial_arts ORDER BY id ASC`);

	const records = await pool.query(`SELECT * FROM records WHERE profile_id = $1`, [profile.id]);
	const record = records.rows[0] || empty_record();

	const awards = await pool.query(`SELECT * FROM awards WHERE profile_id = $1 ORDER BY sort_order ASC`, [profile.id]);
	//const highlights = await pool.query(`SELECT * FROM highlights WHERE profile_id = $1 ORDER BY created_at ASC`, [profile.id]);

	res.render("settings", {
		layout: "layout",
		title: `Settings`,
		profile,
		is_owner,
		is_admin_view,
		corner: user.corner,
		tags: tags.rows,
		badges: badges,
		awards: awards.rows,
		record: record,
		weight_classes: weight_classes.rows,
		martial_arts: martial_arts.rows
		//highlights: highlights.rows
	});
});

/**
 * GET /:username
 * Renders the public profile page for an athlete.
 * @param {import("express").Request} req - Express request object. Expects `username` route param.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/:username", async(req, res) => {
	const username = req.params.username;

	const users = await pool.query(`SELECT * FROM users WHERE LOWER(username) = LOWER($1)`, [username]);

	if(users.rows.length === 0){
		throw errors.not_found("Athlete not found", "html");
	}

	const user = users.rows[0];

	const profiles = await pool.query(`SELECT * FROM profiles WHERE user_id = $1 ORDER BY created_at ASC`, [user.id]);

	if(profiles.rows.length === 0){
		throw errors.not_found("Athlete not found", "html");
	}

	const profile = profiles.rows[0];

	const tags = await pool.query(`SELECT * FROM tags WHERE profile_id = $1 ORDER BY sort_order ASC`, [profile.id]);

	const badges_result = await pool.query(`
		SELECT
			p.id,
			p.first_name,
			p.last_name,
			p.nickname,
			p.profile_picture_url,
			COALESCE(
				(SELECT json_agg(json_build_object('id', wc.id, 'name', wc.name, 'gender', wc.gender) ORDER BY wc.sort_order)
				FROM profile_weight_classes pwc
				JOIN weight_classes wc ON wc.id = pwc.weight_class_id
				WHERE pwc.profile_id = p.id),
				'[]'
			) AS weight_classes,
			COALESCE(
				(SELECT json_agg(json_build_object('id', ma.id, 'name', ma.name) ORDER BY ma.name)
				FROM profile_martial_arts pma
				JOIN martial_arts ma ON ma.id = pma.martial_art_id
				WHERE pma.profile_id = p.id),
				'[]'
			) AS martial_arts
		FROM profiles p
		WHERE p.id = $1
	`, [profile.id]);

	const badges = badges_result.rows[0];

	const records = await pool.query(`SELECT * FROM records WHERE profile_id = $1`, [profile.id]);
	const record = records.rows[0] || empty_record();

	const awards = await pool.query(`SELECT * FROM awards WHERE profile_id = $1 ORDER BY sort_order ASC`, [profile.id]);
	//const highlights = await pool.query(`SELECT * FROM highlights WHERE profile_id = $1 ORDER BY created_at ASC`, [profile.id]);

	const session_id = req.session.user_id;
	const is_login = session_id ? true : false;
	let has_reported = false;

	if(session_id){
		const reports_results = await pool.query(`SELECT * FROM reports WHERE reported_profile_id = $1 AND reporter_user_id = $2 ORDER BY created_at ASC`, [profile.id, session_id]);

		has_reported = reports_results?.rows[0] ? true : false;
	}

	const is_owner = session_id === profile.user_id;

	const nickname = profile.nickname ? ` "${profile.nickname}" ` : " ";
	const full_name = `${profile.first_name}${nickname}${profile.last_name}`;

	res.render("profile", {
		layout: "layout",
		title: full_name,

		//A shared profile link should preview the athlete, not the generic site blurb.
		og_description: `${full_name.trim()} — ${record.wins}-${record.losses}-${record.draws} record, specs and career highlights on STRIKR.`,
		og_image: profile.profile_picture_url || res.locals.og_image,

		profile,
		has_reported,
		is_login,
		is_owner,
		is_beta_tester: user.is_beta_tester,
		is_founding_member: user.is_founding_member,
		corner: user.corner,
		tags: tags.rows,
		badges: badges,
		awards: awards.rows,
		record: record,
		//highlights: highlights.rows
	});
});

//Export router to server file
module.exports = router
