
//Set up libraries
const { fs, path, express } = require('../libs/requirements');
const router = express.Router()

//Setup Router
router.get("/", (req, res) => {
  res.render("explore", {
    title: "Strikr | Explore",
  });
});

//Export router to server file
module.exports = router