
//Set up libraries
const { fs, path, express, pool, bcrypt } = require("../libs/requirements");
const router = express.Router()

//Setup Router

/**
 * Middleware requiring an authenticated session with is_admin set.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next function.
 * @returns {void}
 */
function require_guest(req, res, next){
	if(req.session?.user_id){
		if(res.locals.user.username){
			return res.redirect(`/u/${res.locals.user.username}`);
		}

		return res.redirect("/home");
	}
	next();
}

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

	try{
		const result = await pool.query(
			`SELECT * FROM users WHERE email = $1`,
			[email]
		);

		if(result.rows.length === 0){
			return res.status(401).json({ error: "Invalid credentials" });
		}

		const user = result.rows[0];

		const is_match = await bcrypt.compare(password, user.password_hash);

		if(!is_match){
			return res.status(401).json({ error: "Invalid credentials" });
		}

		//Save user ID and admin status in session
		req.session.user_id = user.id;
		req.session.is_admin = user.is_admin;

		return res.status(200).json({ username: user.username });
	}
	catch(err){
		console.error(err);
		return res.status(500).json({ error: "Server error" });
	}
});

/**
 * GET /signup-availability
 * Checks whether a username and/or email are already registered.
 * @param {import("express").Request} req - Express request object. Expects `username` and/or `email` in the query string.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/signup-availability", async(req, res) => {
	try{
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
	}
	catch(err){
		res.status(500).json({ error: "Failed to check availability" });
	}
});

/**
 * POST /signup
 * Creates a new user, profile, and blank record inside a transaction, then starts a session.
 * @param {import("express").Request} req - Express request object. Expects `corner`, `first_name`, `last_name`, `username`, `email`, and `password` in the body.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/signup", async(req, res) => {
	const { corner, first_name, last_name, username, email, password } = req.body;

	const salt_rounds = 10;
	const hashed_password = await bcrypt.hash(password, salt_rounds);

	try{
		const email_result = await pool.query(
			`SELECT * FROM users WHERE email = $1`,
			[email]
		);

		if(email_result.rows.length > 0){
			return res.status(409).json({ error: "Email already registered" });
		}

		const username_result = await pool.query(
			`SELECT * FROM users WHERE username = $1`,
			[username]
		);

		if(username_result.rows.length > 0){
			return res.status(409).json({ error: "Username already registered" });
		}

		//Define incoming data
		const client = await pool.connect();

		try{
			await client.query("BEGIN");

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
				`INSERT INTO records (profile_id, wins, losses, draws, no_contests)
				 VALUES ($1, 0, 0, 0, 0)`,
				[profile_id]
			);

			await client.query("COMMIT");
			req.session.user_id = user_id;
			req.session.is_admin = false;
			return res.status(201).json({ success: true, id: user_id });
		}
		catch(err){
			await client.query("ROLLBACK");
			console.error("Registration failed:", err);
			return res.status(500).json({ error: "Server error" });
		}
		finally{
			client.release();
		}
	}
	catch(err){
		return res.status(500).json({ error: "Server error" });
	}
});

//Export router to server file
module.exports = router
