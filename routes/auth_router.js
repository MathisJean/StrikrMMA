
//Set up libraries
const { fs, path, express, pool, email_auth } = require('../libs/requirements');
const router = express.Router()

//Setup Router
router.get("/", (req, res) => {
  res.render("auth", {
    title: "Strikr | Authentication"
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body

  try{
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if(result.rows.length === 0){
      return res.status(404).json({ error: "Account not found" });
    }

    const user = result.rows[0];

    // Compare hashed password here if using bcrypt
    //TODO: Hash passwords
    if(user.password_hash !== password){
      return res.status(401).json({ error: "Incorrect password" });
    }

    // Save user ID in session
    req.session.user_id = user.id;

    return res.status(200).json({
      message: "Logged in successfully",
      user: { id: user.id, first_name: user.first_name, last_name: user.last_name }
    });
  }
  catch(err){
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

//Signup Post HTTP request
router.post("/signup", async (req, res) => {
  const { first_name, last_name, email } = req.body;

  const auth_code = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length > 0) {
      return res.status(409).json({ error: "Email already in use" });
    }

    //TODO: send email
    console.log(auth_code);

    return res.status(200).json({ code: auth_code });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});


router.post("/complete", async (req, res) => 
{
  const { user_first_name, user_last_name, user_email, user_password } = req.body;

  //Define incoming data
  try{
    const result = await pool.query(
      `INSERT INTO users (email, first_name, last_name, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [user_email, user_first_name, user_last_name, user_password]
    );

    user = result.rows[0];

    //Session cookies
    req.session.user_id = user.id;

    return res.sendStatus(200).json({ success: true, user: { id: user.id, first_name: user.first_name } });
  }
  catch(err)
  {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
})

//Export router to server file
module.exports = router