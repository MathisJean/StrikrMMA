
//Set up libraries
//`mailer` here is libs/token.js — the token helpers, not libs/mailer.js.
const { express, pool, delete_cloudinary_image, logger, mailer, require_login } = require("../libs/requirements");
const router = express.Router();

//Setup Router

/**
 * GET /account/confirm-deletion
 * Completes a deletion from the emailed link: consumes the token, deletes the account and
 * its cascades, destroys the session, and cleans up the Cloudinary media.
 * @param {import("express").Request} req - Express request object. Expects `token` in the query string.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/confirm-deletion", require_login("html"), async(req, res) => {
	const { token } = req.query;

	if(typeof token !== "string" || token === ""){
		return res.redirect("/home?error=invalid_deletion_token");
	}

	//Scoped to the caller's id, so a forwarded link deletes nothing in someone else's browser.
	const token_row = await mailer.verify_and_consume_token({
		raw_token: token,
		purpose: "account_deletion",
		user_id: req.session.user_id
	});

	if(!token_row){
		return res.redirect("/home?error=invalid_deletion_token");
	}

	//Collected inside the transaction, deleted after it commits, or a rollback strands the row.
	const media_urls = await pool.with_transaction(async(client) => {
		const profile = await client.query(
			`SELECT id, profile_picture_url, profile_banner_url FROM profiles WHERE user_id = $1`,
			[req.session.user_id]
		);

		//TODO: Collect highlight video_urls here once that feature ships; the table does not exist yet.
		await client.query(`DELETE FROM users WHERE id = $1`, [req.session.user_id]);

		return profile.rows.flatMap(p => [p.profile_picture_url, p.profile_banner_url]).filter(Boolean);
	});

	await Promise.all(media_urls.map(url =>
		delete_cloudinary_image(url).catch(err => logger.error("Failed to delete media for a deleted account", err))
	));

	await new Promise((resolve, reject) => {
		req.session.destroy(err => err ? reject(err) : resolve());
	});

	res.clearCookie("connect.sid");
	return res.redirect("/home?message=account_deleted");
});

//Export router to server file
module.exports = router;
