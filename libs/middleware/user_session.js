const pool = require("../db");
const logger = require("../logger");

/**
 * Returns the currently logged-in user's id, username, onboarding state, and profile picture.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").Response} next - Express middleware execution.
 * @returns {Promise<void>}
 */
async function user_session(req, res, next){
	res.locals.user = null;
	req.user = null;

	if(!req.session.user_id){
		return next();
	}

	try{
		const result = await pool.query(
			`SELECT u.id, u.username, u.is_admin, u.onboarding_complete, p.profile_picture_url
				FROM users u
				LEFT JOIN profiles p ON u.id = p.user_id
				WHERE u.id = $1`,
			[req.session.user_id]
		);

		if(result.rows.length > 0){
			req.user = result.rows[0];
			res.locals.user = req.user;
		}

		next();
	}
	catch(err){
		logger.error("user_session middleware failed", err);
		next();
	}
}
module.exports = user_session;