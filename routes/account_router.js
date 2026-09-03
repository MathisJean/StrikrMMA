
//Set up libraries
//`mailer` here is libs/token.js — the token helpers, not libs/mailer.js.
const { express, pool, delete_cloudinary_image, logger, mailer, require_login } = require("../libs/requirements");
const router = express.Router();

//Setup Router

/**
 * GET /account/confirm-deletion
 * Completes an account deletion from the emailed confirmation link: consumes the token,
 * deletes the account (cascading through profiles/records/auth_tokens), destroys the
 * session, and cleans up the associated Cloudinary media.
 * @param {import("express").Request} req - Express request object. Expects `token` in the query string.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/confirm-deletion", require_login("html"), async(req, res) => {
	const { token } = req.query;

	if(typeof token !== "string" || token === ""){
		return res.redirect("/home?error=invalid_deletion_token");
	}

	//Scoped to the caller's own id: a deletion token is only ever valid for the session it
	//was issued to, so a link forwarded to someone else's browser deletes nothing.
	const token_row = await mailer.verify_and_consume_token({
		raw_token: token,
		purpose: "account_deletion",
		user_id: req.session.user_id
	});

	if(!token_row){
		return res.redirect("/home?error=invalid_deletion_token");
	}

	//The URLs are collected inside the transaction but deleted only after it commits —
	//destroying the media first would leave live rows pointing at dead assets on a rollback.
	const media_urls = await pool.with_transaction(async(client) => {
		const profile = await client.query(
			`SELECT id, profile_picture_url, profile_banner_url FROM profiles WHERE user_id = $1`,
			[req.session.user_id]
		);

		//TODO: Collect highlight video_urls here too once the highlights feature ships. The
		//table does not currently exist, and querying it made every account deletion fail.
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
