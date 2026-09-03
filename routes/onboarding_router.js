
//Set up libraries
const { express, pool, errors, validation, require_login } = require("../libs/requirements");
const router = express.Router();

//Setup Router
//A user reaches onboarding with a session but no username, so every route here needs a
//login and none of them can assume a profile exists yet.

/**
 * GET /onboarding
 * Renders the multi-step onboarding flow for an account that has verified an email but has
 * not yet chosen a username and corner.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/", require_login("html"), async(req, res) => {
	const result = await pool.query(
		`SELECT u.onboarding_complete, u.username, u.claimed, p.first_name, p.last_name, p.nickname, p.stance, p.hometown, p.team
		 FROM users u
		 LEFT JOIN profiles p ON p.user_id = u.id
		 WHERE u.id = $1`,
		[req.session.user_id]
	);

	const user = result.rows[0];

	if(!user) throw errors.unauthorized("You must be logged in", "html");

	if(user.onboarding_complete && user.username){
		return res.redirect(`/u/${user.username}`);
	}

	//A claimed placeholder already has an admin-seeded name on file; prefilling it saves the
	//athlete retyping what the profile already says about them.
	return res.render("onboarding", {
		layout: "layout",
		title: "Get Started",
		first_name: user.first_name || "",
		last_name: user.last_name || "",
		nickname: user.nickname || "",
		stance: user.stance || "",
		hometown: user.hometown || "",
		team: user.team || ""
	});
});

/**
 * POST /onboarding/complete
 * Writes everything collected across the flow's steps in a single transaction, creating the
 * profile and record rows if this account does not already have them (a claimed placeholder
 * does). Batched deliberately — a per-step save would leave a half-built account behind if
 * someone closed the tab mid-flow.
 * @param {import("express").Request} req - Express request object. Expects `username`, `corner`, `first_name`, `last_name`, and optionally `nickname`, `stance`, `hometown`, `team` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/complete", require_login("json"), async(req, res) => {
	//The client checks all of this too, but that only saves the user a round trip —
	//a request that skips the form must not skip the rules.
	const username = validation.validate_username(req.body.username);
	const corner = validation.validate_corner(req.body.corner);
	const first_name = validation.validate_name(req.body.first_name, "Given name");
	const last_name = validation.validate_name(req.body.last_name, "Family name");

	//Step 3 is skippable in full, so every one of these may legitimately be absent.
	const nickname = validation.validate_text(req.body.nickname, "Nickname", validation.MAX_TEXT_LENGTHS.nickname);
	const stance = validation.validate_text(req.body.stance, "Stance", validation.MAX_TEXT_LENGTHS.stance);
	const hometown = validation.validate_text(req.body.hometown, "Hometown", validation.MAX_TEXT_LENGTHS.hometown);
	const team = validation.validate_text(req.body.team, "Team", validation.MAX_TEXT_LENGTHS.team);

	await pool.with_transaction(async(client) => {
		const username_check = await client.query(
			`SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2`,
			[username, req.session.user_id]
		);

		if(username_check.rows.length > 0){
			throw errors.conflict("Username already registered");
		}

		//Guarded on onboarding_complete = false so a double-submitted final step cannot
		//rewrite a finished account's username and corner.
		const user_result = await client.query(
			`UPDATE users SET username = $1, corner = $2, claimed = true, onboarding_complete = true
			 WHERE id = $3 AND onboarding_complete = false
			 RETURNING id`,
			[username, corner, req.session.user_id]
		);

		if(user_result.rows.length === 0){
			throw errors.conflict("This account has already been set up");
		}

		//A claimed placeholder arrives with a profile and record already seeded by an admin,
		//so this both creates and updates rather than assuming either case.
		const profile_result = await client.query(
			`INSERT INTO profiles (user_id, first_name, last_name, nickname, stance, hometown, team)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 ON CONFLICT (user_id) DO UPDATE SET
			   first_name = EXCLUDED.first_name,
			   last_name = EXCLUDED.last_name,
			   nickname = COALESCE(EXCLUDED.nickname, profiles.nickname),
			   stance = COALESCE(EXCLUDED.stance, profiles.stance),
			   hometown = COALESCE(EXCLUDED.hometown, profiles.hometown),
			   team = COALESCE(EXCLUDED.team, profiles.team),
			   updated_at = now()
			 RETURNING id`,
			[req.session.user_id, first_name, last_name, nickname, stance, hometown, team]
		);

		await client.query(
			`INSERT INTO records (profile_id) VALUES ($1) ON CONFLICT (profile_id) DO NOTHING`,
			[profile_result.rows[0].id]
		);
	}).catch(err => {
		//The username check above races against a concurrent signup; the unique index on
		//lower(username) is what actually decides, so report its verdict as a conflict
		//rather than letting it surface as an unexplained 500.
		if(err.code === "23505"){
			throw errors.conflict("That username is already registered");
		}

		throw err;
	});

	return res.status(200).json({ success: true, redirect: `/u/${username}` });
});

//Export router to server file
module.exports = router;
