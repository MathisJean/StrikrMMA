//Set up libraries
const { express, pool, upload_cloudinary_image, delete_cloudinary_image, errors, logger, mailer, validation, require_login, rate_limits } = require("../libs/requirements");
const router = express.Router();

const multer = require("multer");

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: MAX_UPLOAD_BYTES,
		files: 2 //profile picture + banner, the only two media fields on the form
	},
	fileFilter: (req, file, cb) => {
		if(!ALLOWED_IMAGE_TYPES.has(file.mimetype)){
			return cb(errors.bad_request("Only PNG, JPEG, WebP and HEIC images can be uploaded"));
		}

		cb(null, true);
	}
});

const EDITABLE_FIELDS = {
	profiles: [
		"nickname", "stance", "team", "hometown",
		"walkout_song", "walkout_song_artist",
		"profile_picture_url", "profile_banner_url", "instagram_url"
	],
	records: [
		"wins", "losses", "draws", "no_contests", "ko", "submissions"
	]
};

//Declared, not inferred: inferring from an empty value sent every cleared text field down the upload path.
const FILE_FIELDS = new Set(["profile_picture_url", "profile_banner_url"]);

//multer accepts only these field names, so an unexpected file is rejected before it is read into memory.
const UPLOAD_FIELDS = [...FILE_FIELDS].map(name => ({ name, maxCount: 1 }));

//Every `records` column is NOT NULL, so a cleared input has to land as 0, never NULL.
const NUMERIC_FIELDS = {
	profiles: new Set(),
	records: new Set(["wins", "losses", "draws", "no_contests", "ko", "submissions"])
};

//The form edits height as two inputs; the database stores one `profiles.height` in inches.
const HEIGHT_PARTS = ["height_feet", "height_inches"];

/**
 * Folds the form's two height inputs into the single `profiles.height` column. An unsubmitted
 * part is read back off the row; a blank one counts as 0, so clearing both clears the height.
 * @param {string} profile_id - Profile whose height is being set.
 * @param {object} fields - Incoming field values for the profiles group.
 * @returns {Promise<number|null>} Total height in inches, or null when nothing is set.
 */
async function resolve_height(profile_id, fields){
	let feet = HEIGHT_PARTS[0] in fields ? parseInt(fields.height_feet, 10) || 0 : null;
	let inches = HEIGHT_PARTS[1] in fields ? parseInt(fields.height_inches, 10) || 0 : null;

	if(feet === null || inches === null){
		const { rows } = await pool.query(`SELECT height FROM profiles WHERE id = $1`, [profile_id]);
		const current = rows[0]?.height || 0;

		if(feet === null) feet = Math.floor(current / 12);
		if(inches === null) inches = current % 12;
	}

	const total = Math.max((feet * 12) + inches, 0);

	return total > 0 ? total : null;
}

/**
 * Coerces an incoming value into what its column expects: numeric columns get a
 * non-negative integer (blank becomes 0), text columns get a trimmed string or NULL.
 * @param {string} table_name - Table the column belongs to.
 * @param {string} key - Column name.
 * @param {*} value - Raw incoming value.
 * @returns {number|string|null} Value ready to bind to a parameterized query.
 */
function normalize_value(table_name, key, value){
	if(NUMERIC_FIELDS[table_name]?.has(key)){
		const number = parseInt(value, 10);

		return Number.isFinite(number) && number > 0 ? number : 0;
	}

	const text = typeof value === "string" ? value.trim() : value;

	return text === "" || text === undefined ? null : text;
}

/**
 * Applies allow-listed field updates to a single-row table, media included. Never throws, so
 * one group cannot block another; old assets are deleted only once the UPDATE succeeds.
 * @param {string} table_name - Table to update. Must be a key of EDITABLE_FIELDS.
 * @param {string} where_column - Column used to locate the row.
 * @param {string} where_value - Value matched against where_column.
 * @param {object} fields - Incoming field values keyed by column name.
 * @param {import("express").Request} req - Express request object, used to read uploaded files.
 * @returns {Promise<{ table_failed: boolean, failed_uploads: string[], media: Object<string, string|null> }>} What, if anything, failed, plus the saved URL of every media column this update changed.
 */
async function update_simple_table(table_name, where_column, where_value, fields, req){
	const allowed_keys = Object.keys(fields).filter(key =>
		EDITABLE_FIELDS[table_name]?.includes(key)
	);

	const height_submitted = table_name === "profiles" && HEIGHT_PARTS.some(part => part in fields);

	if(allowed_keys.length === 0 && !height_submitted) return { table_failed: false, failed_uploads: [], media: {} };

	const column_values = {};
	const media_tracking = { uploaded: [], superseded: [] };
	const failed_uploads = [];
	const media = {};

	try{
		if(height_submitted){
			column_values.height = await resolve_height(where_value, fields);
		}

		for(const key of allowed_keys){
			if(!FILE_FIELDS.has(key)){
				column_values[key] = normalize_value(table_name, key, fields[key]);
				continue;
			}

			const uploaded_file = req.files?.[key]?.[0];
			const is_removal = fields[key] === null || fields[key] === "";

			//A string with no file is the client echoing back its own URL; ignoring it stops a caller setting an arbitrary one.
			if(!uploaded_file && !is_removal) continue;

			const { rows } = await pool.query(
				`SELECT ${key} FROM ${table_name} WHERE ${where_column} = $1`,
				[where_value]
			);
			const old_url = rows[0]?.[key];

			let value = null;

			if(uploaded_file){
				let result;

				try{
					result = await upload_cloudinary_image(uploaded_file.buffer);
				}
				catch(err){
					logger.error(`Failed to upload media for field ${key}`, err);
					failed_uploads.push(key);
					continue;
				}

				value = result.secure_url;
				media_tracking.uploaded.push(value);
			}

			if(old_url) media_tracking.superseded.push(old_url);

			column_values[key] = value;
			media[key] = value;
		}

		const keys = Object.keys(column_values);
		if(keys.length === 0) return { table_failed: false, failed_uploads, media };

		const set_clauses = keys.map((key, i) => `${key} = $${i + 1}`);
		const values = keys.map(key => column_values[key]);
		values.push(where_value);

		//Execute Database Update
		await pool.query(
			`UPDATE ${table_name} SET ${set_clauses.join(", ")}, updated_at = now() WHERE ${where_column} = $${values.length}`,
			values
		);
	}
	catch(err){
		logger.error(`Failed to update ${table_name}`, err);

		//Nothing was saved, so the new uploads are orphans; the old assets were never touched.
		media_tracking.uploaded.forEach(url => {
			delete_cloudinary_image(url).catch(cleanup_err => logger.error("Failed to clean up orphaned upload after failed update", cleanup_err));
		});

		return { table_failed: true, failed_uploads, media: {} };
	}

	//The new values are the source of truth now, so what they superseded can go.
	media_tracking.superseded.forEach(url => {
		delete_cloudinary_image(url).catch(err => logger.error("Orphaned image cleanup failed", err));
	});

	return { table_failed: false, failed_uploads, media };
}

/**
 * Replaces a profile's weight classes. Its own transaction so the delete+reinsert cannot
 * half-apply; never throws, so one group's failure cannot block the rest of the PATCH.
 * @param {string} profile_id - Profile the weight classes belong to.
 * @param {{ name: string, gender: string }[]} entries - Weight classes to assign.
 * @returns {Promise<boolean>} True if the update succeeded.
 */
async function update_weight_classes(profile_id, entries){
	try{
		await pool.with_transaction(async(client) => {
			await client.query(`DELETE FROM profile_weight_classes WHERE profile_id = $1`, [profile_id]);

			for(const { name, gender } of entries){
				const wc = await client.query(
					`SELECT id FROM weight_classes WHERE name = $1 AND gender = $2`,
					[name, gender]
				);
				if(wc.rows.length > 0){
					await client.query(
						`INSERT INTO profile_weight_classes(profile_id, weight_class_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
						[profile_id, wc.rows[0].id]
					);
				}
			}
		});

		return true;
	}
	catch(err){
		logger.error("Failed to update weight classes", err);
		return false;
	}
}

/**
 * Replaces a profile's martial arts. Its own transaction, and never throws, so one group's
 * failure cannot block the rest of the PATCH.
 * @param {string} profile_id - Profile the martial arts belong to.
 * @param {{ name: string }[]} entries - Martial arts to assign.
 * @returns {Promise<boolean>} True if the update succeeded.
 */
async function update_martial_arts(profile_id, entries){
	const names = entries.map(e => e.name).filter(Boolean);

	try{
		await pool.with_transaction(async(client) => {
			await client.query(`DELETE FROM profile_martial_arts WHERE profile_id = $1`, [profile_id]);

			for(const name of names){
				const ma = await client.query(`SELECT id FROM martial_arts WHERE name = $1`, [name]);
				if(ma.rows.length > 0){
					await client.query(
						`INSERT INTO profile_martial_arts(profile_id, martial_art_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
						[profile_id, ma.rows[0].id]
					);
				}
			}
		});

		return true;
	}
	catch(err){
		logger.error("Failed to update martial arts", err);
		return false;
	}
}

/**
 * Replaces a profile's tags, preserving order. Its own transaction, and never throws, so one
 * group's failure cannot block the rest of the PATCH.
 * @param {string} profile_id - Profile the tags belong to.
 * @param {{ tag_text: string }[]} entries - Tags to assign, in display order.
 * @returns {Promise<boolean>} True if the update succeeded.
 */
async function update_tags(profile_id, entries){
	try{
		await pool.with_transaction(async(client) => {
			await client.query(`DELETE FROM tags WHERE profile_id = $1`, [profile_id]);

			for(let i = 0; i < entries.length; i++){
				const text = entries[i]?.tag_text?.trim();
				if(text){
					await client.query(
						`INSERT INTO tags(profile_id, tag_text, sort_order) VALUES($1, $2, $3)`,
						[profile_id, text, i]
					);
				}
			}
		});

		return true;
	}
	catch(err){
		logger.error("Failed to update tags", err);
		return false;
	}
}

/**
 * Replaces a profile's awards. Its own transaction, and never throws, so one group's failure
 * cannot block the rest of the PATCH.
 * @param {string} profile_id - Profile the awards belong to.
 * @param {{ title: string, description?: string }[]} entries - Awards to assign, in display order.
 * @returns {Promise<boolean>} True if the update succeeded.
 */
async function update_awards(profile_id, entries){
	try{
		await pool.with_transaction(async(client) => {
			await client.query(`DELETE FROM awards WHERE profile_id = $1`, [profile_id]);

			//Written from the form position like tags; ordering by the always-null date_earned shuffled them.
			let sort_order = 0;

			for(const entry of entries){
				const title = entry?.title?.trim();
				if(title){
					await client.query(
						`INSERT INTO awards(profile_id, title, description, sort_order) VALUES($1, $2, $3, $4)`,
						[profile_id, title, entry.description?.trim() || null, sort_order]
					);

					sort_order++;
				}
			}
		});

		return true;
	}
	catch(err){
		logger.error("Failed to update awards", err);
		return false;
	}
}

//Free-text fields by group, with error labels. The columns are unbounded, so this caps size — views handle markup.
const TEXT_FIELDS = {
	profiles: {
		nickname: "Nickname",
		stance: "Stance",
		team: "Team",
		hometown: "Hometown",
		walkout_song: "Walkout song",
		walkout_song_artist: "Walkout song artist",
		instagram_url: "Instagram username"
	},
	tags: { tag_text: "Tag" },
	awards: { title: "Award title", description: "Award description" }
};

//`awards` uses its own cap names, since "title" and "description" are too generic to key on.
const TEXT_LENGTH_KEYS = {
	title: "award_title",
	description: "award_description"
};

/**
 * Enforces free-text length caps across the whole payload before any group is applied, so an
 * over-long field names itself instead of surfacing as a generic "this group failed".
 * @param {object} data - Parsed update payload keyed by group.
 * @returns {void}
 * @throws {import("../libs/errors.js").AppError} 400 if any free-text field exceeds its cap.
 */
function validate_payload_text(data){
	for(const [group, labels] of Object.entries(TEXT_FIELDS)){
		const incoming = data[group];

		if(!incoming) continue;

		//profiles/records arrive as one object; tags/awards as an array of them.
		const entries = Array.isArray(incoming) ? incoming : [incoming];

		for(const entry of entries){
			if(!entry || typeof entry !== "object") continue;

			for(const [field, label] of Object.entries(labels)){
				if(!(field in entry)) continue;

				const max = validation.MAX_TEXT_LENGTHS[TEXT_LENGTH_KEYS[field] || field];

				validation.validate_text(entry[field], label, max);
			}
		}
	}
}

//Setup Router

/**
 * PATCH /update/profile
 * Applies a batch of profile updates. Each group is applied independently — only the ownership
 * check is a hard stop for the whole request.
 * @param {import("express").Request} req - Express request object. Expects a `json` field describing the update groups, plus optional uploaded files.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.patch("/update/profile", require_login("json"), upload.fields(UPLOAD_FIELDS), async(req, res) => {
	let data;

	try{
		data = JSON.parse(req.body.json);
	}
	catch{
		throw errors.bad_request("Malformed update payload");
	}

	const id = validation.validate_uuid(data?.id, "profile id");

	//Before any group runs, so an over-long field reports itself rather than a half-applied save.
	validate_payload_text(data);

	const profiles = await pool.query(
		`SELECT p.id, p.user_id, u.claimed
		 FROM profiles p
		 JOIN users u ON u.id = p.user_id
		 WHERE p.id = $1`,
		[id]
	);

	if(profiles.rows.length === 0){
		throw errors.not_found("Profile not found");
	}

	const target = profiles.rows[0];
	const is_owner = target.user_id === req.session.user_id;

	//Mirrors the settings page: an admin may edit placeholder profiles only, never a claimed one.
	const can_edit = is_owner || (Boolean(req.session.is_admin) && !target.claimed);

	if(!can_edit){
		throw errors.forbidden("Not authorized to edit this profile");
	}

	const groups = Object.keys(data).filter(group => group !== "id");

	const failed_uploads = [];
	const failed_groups = [];
	let media = {};

	for(const group of groups){
		switch(group){
			case "profiles":{
				const result = await update_simple_table("profiles", "id", id, data.profiles, req);
				failed_uploads.push(...result.failed_uploads);
				if(result.table_failed) failed_groups.push(group);
				media = { ...media, ...result.media };
				break;
			}

			case "records":{
				const result = await update_simple_table("records", "profile_id", id, data.records, req);
				failed_uploads.push(...result.failed_uploads);
				if(result.table_failed) failed_groups.push(group);
				break;
			}

			case "profile_weight_classes":
				if(!(await update_weight_classes(id, data.profile_weight_classes || []))) failed_groups.push(group);
				break;

			case "profile_martial_arts":
				if(!(await update_martial_arts(id, data.profile_martial_arts || []))) failed_groups.push(group);
				break;

			case "tags":
				if(!(await update_tags(id, data.tags || []))) failed_groups.push(group);
				break;

			case "awards":
				if(!(await update_awards(id, data.awards || []))) failed_groups.push(group);
				break;

			default:
				logger.warn(`Unknown update group received: ${group}`);
		}
	}

	return res.status(200).json({
		success: true,
		media,
		is_owner,
		failed_uploads,
		failed_groups
	});
});

/**
 * POST /request-deletion
 * Emails a single-use deletion link. Replaces the password re-type a password app would use,
 * and proves current inbox access rather than knowledge of a string.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/request-deletion", require_login("json"), rate_limits.deletion_request_limit, async(req, res) => {
	const result = await pool.query(`SELECT email FROM users WHERE id = $1`, [req.session.user_id]);
	const email = result.rows[0]?.email;

	if(!email){
		throw errors.bad_request("This account has no email address on file");
	}

	try{
		await mailer.create_and_send_token({
			user_id: req.session.user_id,
			email,
			purpose: "account_deletion",
			ttl_interval: "15 minutes",
			subject: "Confirm account deletion",
			build_link: raw_token => `${process.env.APP_BASE_URL}/account/confirm-deletion?token=${raw_token}`,
			build_html: link => `
				<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; justify-content: center;">
					<p style="margin-top: 0; margin-bottom: 16px; font-size: 15px; line-height: 1.5; color: #334155; text-align: center;">
						Click to permanently delete your STRIKR account:
					</p>
					
					<p style="margin-top: 0; margin-bottom: 24px; text-align: center;">
						<a href="${link}" style="display: inline-block; padding: 12px 24px; background-color: #dc2626; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 6px;">Confirm Deletion</a>
					</p>
					
					<p style="margin-bottom: 0; font-size: 13px; line-height: 1.5; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 16px;">
						This link expires in 15 minutes. If you didn't request this, you can <b>ignore this email</b> and nothing will be deleted.
					</p>
				</div>
			`
		});
	}
	catch(err){
		logger.error("Failed to send an account deletion link", err);

		//The caller is waiting on this email, so a failure has to say so rather than strand them.
		throw errors.server_error("We couldn't send the confirmation email. Please try again.");
	}

	return res.status(200).json({ message: "Check your email to confirm account deletion." });
});

/**
 * POST /logout-everywhere
 * Ends every session belonging to the caller. With no password there is no other way to
 * invalidate a session on a lost device.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.post("/logout-everywhere", require_login("json"), async(req, res) => {
	//`sess` is a json column, not jsonb, so the cast is what makes the ->> lookup available.
	await pool.query(
		`DELETE FROM session WHERE sess::jsonb ->> 'user_id' = $1`,
		[req.session.user_id]
	);

	//Destroyed as well as deleted, or the in-memory session could be written back on the way out.
	await new Promise(resolve => req.session.destroy(() => resolve()));

	res.clearCookie("connect.sid");
	return res.status(200).json({ message: "Logged out of all devices." });
});

/**
 * GET /username-availability
 * Checks whether a username is free. Unauthenticated, since onboarding calls it before setup finishes.
 * @param {import("express").Request} req - Express request object. Expects `username` in the query string.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/username-availability", rate_limits.public_read_limit, async(req, res) => {
	const { username } = req.query;

	if(typeof username !== "string" || username.trim() === ""){
		return res.status(200).json({ username_available: false });
	}

	const result = await pool.query(
		`SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(username) = LOWER($1))`,
		[username.trim()]
	);

	return res.status(200).json({ username_available: !result.rows[0].exists });
});

/**
 * POST /logout
 * Destroys the caller's session and clears the session cookie.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {void}
 */
router.post("/logout", async(req, res) => {
	await new Promise((resolve, reject) => {
		req.session.destroy(err => err ? reject(err) : resolve());
	});

	res.clearCookie("connect.sid");
	return res.status(200).json({ success: true });
});

/**
 * GET /athletes
 * Searches and paginates athlete profiles, optionally filtered by a free-text search term.
 * @param {import("express").Request} req - Express request object. Accepts `limit`, `page`, and `search` query params.
 * @param {import("express").Response} res - Express response object.
 * @returns {Promise<void>}
 */
router.get("/athletes", rate_limits.public_read_limit, async(req, res) => {
	const limit = Math.min(parseInt(req.query.limit) || 20, 50);
	const page = Math.max(parseInt(req.query.page) || 1, 1);
	const offset = limit * (page - 1);

	const search = req.query.search?.trim();
	const escape_like = (str) => str.replace(/[%_]/g, "\\$&");

	const base_select = `
		SELECT
			p.id,
			p.user_id,
			u.username,
			p.first_name,
			p.nickname,
			p.last_name,
			p.profile_picture_url,
			r.wins,
			r.losses,
			r.draws,
			r.no_contests,
			COALESCE(
			  (SELECT json_agg(wc.name)
			     FROM profile_weight_classes pwc
			     JOIN weight_classes wc ON wc.id = pwc.weight_class_id
			     WHERE pwc.profile_id = p.id),
			    '[]'
			) AS weight_classes,
			COALESCE(
			  (SELECT json_agg(ma.name)
			     FROM profile_martial_arts pma
			     JOIN martial_arts ma ON ma.id = pma.martial_art_id
			     WHERE pma.profile_id = p.id),
			    '[]'
			) AS martial_arts,
			COUNT(*) OVER() AS total_count
		FROM profiles p
		JOIN users u ON u.id = p.user_id
		LEFT JOIN records r ON r.profile_id = p.id
	`;

	let query, values;

	if(!search){
		query = `${base_select} ORDER BY p.last_name LIMIT $1 OFFSET $2;`;
		values = [limit, offset];
	}
	else if(search === "*"){
		query = `${base_select} ORDER BY RANDOM() LIMIT $1;`;
		values = [limit];
	}
	else{
		const words = search.split(/\s+/);
		const conditions = words.map((_, i) => `
		  (p.first_name ILIKE $${i + 1} OR p.last_name ILIKE $${i + 1} OR p.nickname ILIKE $${i + 1} OR u.username ILIKE $${i + 1})
		`).join(" AND ");

		values = words.map(w => `%${escape_like(w)}%`);
		values.push(limit, offset);

		query = `
			${base_select}
			WHERE ${conditions}
			ORDER BY p.last_name
			LIMIT $${words.length + 1} OFFSET $${words.length + 2};
		`;
	}

	const result = await pool.query(query, values);
	const total_count = result.rows[0]?.total_count || 0;

	res.json({
		athletes: result.rows,
		total_count: parseInt(total_count)
	});
});

module.exports = router;
