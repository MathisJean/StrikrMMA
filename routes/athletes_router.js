
//Set up libraries
const { fs, path, express, pool } = require('../libs/requirements');
const router = express.Router()

//Setup Router
router.get("/", async (req, res) => { 
	res.render("profile", {
		layout: "layout",
		title: "Strikr | Athletes"
	});
});

router.get("/:username/settings", async (req, res) => {
	if(!req.session.user_id){
		return res.status(401).json({ error: "You must be logged in" });
	}

	const username = req.params.username;
	
	const users = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
	
	if(users.rows.length === 0){
		return res.status(404).json({ error: "Athlete not found" });
	}
	
	const user = users.rows[0];

	const is_owner = req.session.user_id === user.id;

	if(!is_owner) return res.status(403).send("You do not have permission to edit this profile");

	const profiles = await pool.query("SELECT * FROM profiles WHERE user_id = $1 ORDER BY created_at ASC", [user.id]);

	if(profiles.rows.length === 0){
		return res.status(404).json({ error: "Athlete not found" });
	}

	const profile = profiles.rows[0];

	const tags = await pool.query("SELECT * FROM tags WHERE profile_id = $1 ORDER BY sort_order ASC", [profile.id]);

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

	const weight_classes = await pool.query("SELECT * FROM weight_classes ORDER BY sort_order ASC");
	const martial_arts = await pool.query("SELECT * FROM martial_arts ORDER BY id ASC");

	const records = await pool.query("SELECT * FROM records WHERE profile_id = $1 ORDER BY updated_at ASC", [profile.id]);
	let record = {};

	if(records.rows.length != 0){
		record = records.rows[0];
	}
	else{
		record["wins"] = 0;
		record["losses"] = 0;
		record["draws"] = 0;
		record["no_contests"] = 0;

		record["ko"] = 0;
		record["submissions"] = 0;

		record["total_fights"] = 0;
	}

	const awards = await pool.query("SELECT * FROM awards WHERE profile_id = $1 ORDER BY date_earned DESC", [profile.id]);
	//const highlights = await pool.query("SELECT * FROM highlights WHERE profile_id = $1 ORDER BY created_at ASC", [profile.id]);
	
	const nickname = profile.nickname? ` "${profile.nickname}" ` : " ";

	res.render("settings", {
		layout: "layout",
		title: `Strikr | ${profile.first_name}${nickname}${profile.last_name}`,
		profile,
		is_owner,
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

router.get("/:username", async (req, res) => {
	const username = req.params.username;
	
	const users = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
	
	if(users.rows.length === 0){
		return res.status(404).json({ error: "Athlete not found" });
	}
	
	const user = users.rows[0];

	const profiles = await pool.query("SELECT * FROM profiles WHERE user_id = $1 ORDER BY created_at ASC", [user.id]);

	if(profiles.rows.length === 0){
		return res.status(404).json({ error: "Athlete not found" });
	}

	const profile = profiles.rows[0];

	const tags = await pool.query("SELECT * FROM tags WHERE profile_id = $1 ORDER BY sort_order ASC", [profile.id]);
	const weight = await pool.query("SELECT * FROM tags WHERE profile_id = $1 ORDER BY sort_order ASC", [profile.id]);

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

	const records = await pool.query("SELECT * FROM records WHERE profile_id = $1 ORDER BY updated_at ASC", [profile.id]);
	let record = {};

	if(records.rows.length != 0){
		record = records.rows[0];
	}
	else{
		record["wins"] = 0;
		record["losses"] = 0;
		record["draws"] = 0;

		record["ko"] = 0;
		record["submissions"] = 0;

		record["total_fights"] = 0;
	}

	const awards = await pool.query("SELECT * FROM awards WHERE profile_id = $1 ORDER BY date_earned DESC", [profile.id]);
	//const highlights = await pool.query("SELECT * FROM highlights WHERE profile_id = $1 ORDER BY created_at ASC", [profile.id]);
	
	const is_owner = req.session.user_id === profile.user_id;

	const nickname = profile.nickname? ` "${profile.nickname}" ` : " ";

	res.render("profile", {
		layout: "layout",
		title: `Strikr | ${profile.first_name}${nickname}${profile.last_name}`,
		profile,
		is_owner,
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