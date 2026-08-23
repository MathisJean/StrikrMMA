
//Set up libraries
const { fs, path, express, pool, bcrypt } = require('../libs/requirements');
const router = express.Router()

//Setup Router
router.get("/", (req, res) => {
	res.render("auth", {
		title: "Strikr | Authentication"
	});
});

router.post("/login", async (req, res) => {
	const { email, password } = req.body;

	try{
		const result = await pool.query(
			'SELECT * FROM users WHERE email = $1',
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

		//Save user ID in session
		req.session.user_id = user.id;

		return res.status(200).json({ username: user.username});
	}
	catch(err){
		console.error(err);
		return res.status(500).json({ error: "Server error" });
	}
});

//Signup Post HTTP request
router.get("/signup-availability", async (req, res) => {
	try{
        const { username, email } = req.query;

        let username_taken = false;
        let email_taken = false;

        if(username){
            const user_check = await pool.query(
                'SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(username) = LOWER($1))',
                [username.trim()]
            );
            username_taken = user_check.rows[0].exists;
        }

        if(email){
            const email_check = await pool.query(
                'SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER($1))',
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

router.post("/signup", async (req, res) => {
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

        const userResult = await client.query(
            `INSERT INTO users (username, email, password_hash, corner)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [username, email, password_hash, corner]
        );
        const userId = userResult.rows[0].id;

        const profileResult = await client.query(
            `INSERT INTO profiles (user_id, first_name, last_name)
             VALUES ($1, $2, $3) RETURNING id`,
            [userId, first_name, last_name]
        );
        const profileId = profileResult.rows[0].id;

        await client.query(
            `INSERT INTO records (profile_id, wins, losses, draws, no_contests)
             VALUES ($1, 0, 0, 0, 0)`,
            [profileId]
        );

        await client.query("COMMIT");
        req.session.user_id = userId;
        return res.status(201).json({ success: true, id: userId });

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