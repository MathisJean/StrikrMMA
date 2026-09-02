
//Set up libraries
const { express, pool, bcrypt, errors, validation, require_guest } = require("../libs/requirements");
const router = express.Router()

//Setup Router
router.use(require_guest);

/**
 * GET /
 * Renders the authentication page.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {void}
 */
router.get("/", (req, res) => {
	res.render("auth", {
		title: "Authentication"
	});
});

/**
 * POST /login
 * Authenticates a user by email and password and starts a session.
 * @param {import("express").Request} req - Express request object. Expects `email` and `password` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/login", async(req, res) => {
	const { email, password } = req.body;

	if(typeof email !== "string" || typeof password !== "string" || email === "" || password === ""){
		throw errors.unauthorized("Invalid credentials");
	}

	const result = await pool.query(
		`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
		[email.trim()]
	);

	if(result.rows.length === 0){
		throw errors.unauthorized("Invalid credentials");
	}

	const user = result.rows[0];

	//Placeholder accounts created by an admin have no password until they are claimed.
	//bcrypt.compare throws on a null hash, so this has to be checked before comparing.
	if(!user.password_hash){
		throw errors.unauthorized("Invalid credentials");
	}

	const is_match = await bcrypt.compare(password, user.password_hash);

	if(!is_match){
		throw errors.unauthorized("Invalid credentials");
	}

	//Save user ID and admin status in session
	req.session.user_id = user.id;
	req.session.is_admin = user.is_admin;

	return res.status(200).json({ username: user.username });
});

/**
 * GET /signup-availability
 * Checks whether a username and/or email are already registered.
 * @param {import("express").Request} req - Express request object. Expects `username` and/or `email` in the query string.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/signup-availability", async(req, res) => {
	const { username, email } = req.query;

	let username_taken = false;
	let email_taken = false;

	if(username){
		const user_check = await pool.query(
			`SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(username) = LOWER($1))`,
			[username.trim()]
		);
		username_taken = user_check.rows[0].exists;
	}

	if(email){
		const email_check = await pool.query(
			`SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER($1))`,
			[email.trim()]
		);
		email_taken = email_check.rows[0].exists;
	}

	res.status(200).json({
		username_available: !username_taken,
		email_available: !email_taken
	});
});

/**
 * POST /signup
 * Creates a new user, profile, and blank record inside a transaction, then starts a session.
 * @param {import("express").Request} req - Express request object. Expects `corner`, `first_name`, `last_name`, `username`, `email`, and `password` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/signup", async(req, res) => {
	//The client checks all of this too, but that only saves the user a round trip —
	//a request that skips the form must not skip the rules.
	const corner = validation.validate_corner(req.body.corner);
	const first_name = validation.validate_name(req.body.first_name, "Given name");
	const last_name = validation.validate_name(req.body.last_name, "Family name");
	const username = validation.validate_username(req.body.username);
	const email = validation.validate_email(req.body.email);
	const password = validation.validate_password(req.body.password);

	const email_result = await pool.query(
		`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
		[email]
	);

	if(email_result.rows.length > 0){
		throw errors.conflict("Email already registered");
	}

	const username_result = await pool.query(
		`SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
		[username]
	);

	if(username_result.rows.length > 0){
		throw errors.conflict("Username already registered");
	}

	const salt_rounds = 10;
	const hashed_password = await bcrypt.hash(password, salt_rounds);

	const user_id = await pool.with_transaction(async(client) => {
		const user_result = await client.query(
			`INSERT INTO users (username, email, password_hash, corner)
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			[username, email, hashed_password, corner]
		);
		const user_id = user_result.rows[0].id;

		const profile_result = await client.query(
			`INSERT INTO profiles (user_id, first_name, last_name)
			 VALUES ($1, $2, $3) RETURNING id`,
			[user_id, first_name, last_name]
		);
		const profile_id = profile_result.rows[0].id;

		await client.query(
			`INSERT INTO records (profile_id) VALUES ($1)`,
			[profile_id]
		);

		return user_id;
	}).catch(err => {
		//The checks above race against a concurrent signup; the unique indexes on
		//lower(username)/lower(email) are what actually decides, so report their verdict
		//as a conflict rather than letting it surface as an unexplained 500.
		if(err.code === "23505"){
			throw errors.conflict("That username or email is already registered");
		}

		throw err;
	});

	req.session.user_id = user_id;
	req.session.is_admin = false;
	return res.status(201).json({ success: true, id: user_id });
});

//Export router to server file
module.exports = router
