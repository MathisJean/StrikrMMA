
//Set up libraries
const { fs, path, express, pool } = require('../libs/requirements');
const router = express.Router()

//Setup Router
router.get("/", async (req, res) => { 
  res.render("athletes", {
    layout: "layout",
    title: "Strikr | Athletes"
  });
});

router.get("/:slug/settings", async (req, res) => {
  const slug = req.params.slug;
  const parts = slug.split("_");
  const id = parts[parts.length - 1];

  if(isNaN(id)) return res.status(400).send("Bad slug");

  const user = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  if(user.rows.length === 0){
    return res.status(404).send("Athlete not found");
  }

  const events = await pool.query("SELECT * FROM events WHERE user_id = $1 ORDER BY order_index ASC", [id]);
  const highlights = await pool.query("SELECT * FROM highlights WHERE user_id = $1 ORDER BY order_index ASC", [id]);

  const profile = user.rows[0];
  const is_owner = req.session.user_id === profile.id;

  if(is_owner){
    res.render("settings", {
      layout: "layout",
      title: "Strikr | Settings",
      profile,
      events: events.rows,
      highlights: highlights.rows
    });
  }
  else{
    res.status(404).render("error");
  }
});

router.get("/:slug", async (req, res) => {
  const slug = req.params.slug;
  const parts = slug.split("_");
  const id = parts[parts.length - 1];

  if(isNaN(id)) return res.status(400).send("Bad slug");

  const user = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  if(user.rows.length === 0){
    return res.status(404).send("Athlete not found");
  }

  const events = await pool.query("SELECT * FROM events WHERE user_id = $1 ORDER BY order_index ASC", [id]);
  const highlights = await pool.query("SELECT * FROM highlights WHERE user_id = $1 ORDER BY order_index ASC", [id]);
  
  const profile = user.rows[0];
  const is_owner = req.session.user_id === profile.id;

  const nickname = profile.nickname? ` "${profile.nickname}" ` : " ";

  res.render("profile",
  {
    layout: "layout",
    title: `Strikr | ${profile.first_name}${nickname}${profile.last_name}`,
    profile,
    is_owner,
    events: events.rows,
    highlights: highlights.rows
  });
});

//Export router to server file
module.exports = router