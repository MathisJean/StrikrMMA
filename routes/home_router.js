
//Set up libraries
const { express } = require("../libs/requirements");
const router = express.Router()

//Setup Router

/**
 * GET /
 * Renders the home page.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {void}
 */
router.get("/", (req, res) => {
	res.render("home", {
		title: "Home",
		notice: typeof req.query.message === "string" ? req.query.message : null,
		notice_error: typeof req.query.error === "string" ? req.query.error : null
	});
});

//Export router to server file
module.exports = router
