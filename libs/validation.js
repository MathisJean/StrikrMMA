
//Set up libraries
const errors = require('./errors.js');

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 50;

const CODE_REGEX = /^[0-9]{6}$/;

//Caps for the free-text an athlete controls. The columns are unbounded varchar/text, so
//without these a single field could carry an unbounded payload into every page that
//renders it. Views escape their output, so this is about size, not markup.
const MAX_TEXT_LENGTHS = {
	nickname: 30,
	stance: 20,
	team: 60,
	hometown: 60,
	walkout_song: 100,
	walkout_song_artist: 100,
	instagram_url: 30,
	tag_text: 30,
	award_title: 60,
	award_description: 200
};

const CORNERS = ["red", "blue"];

//Names that would collide with a route or read as official. Kept in sync with the
//copies in public/js/auth.js and public/js/claim.js, which only pre-empt the error
//for the user — this list is the one that actually enforces it.
const RESERVED_USERNAMES = new Set([
	"admin", "api", "athletes", "auth", "claim", "error", "explore", "false", "home",
	"null", "profile", "report", "settings", "strikr", "support", "system", "true",
	"u", "undefined", "upload"
]);

/**
 * Validates a username's length, character set, and reserved status.
 * @param {unknown} value - Raw username from the request body.
 * @returns {string} The trimmed username.
 * @throws {import("./errors.js").AppError} 400 if the username is unusable.
 */
function validate_username(value){
	const username = typeof value === "string" ? value.trim() : "";

	if(!USERNAME_REGEX.test(username)){
		throw errors.bad_request("Username must be 3-30 characters, using only letters, numbers, underscores, and hyphens");
	}

	if(RESERVED_USERNAMES.has(username.toLowerCase())){
		throw errors.bad_request("This username is reserved and cannot be registered");
	}

	return username;
}

/**
 * Validates an email address's shape and length.
 * @param {unknown} value - Raw email from the request body.
 * @returns {string} The trimmed email.
 * @throws {import("./errors.js").AppError} 400 if the email is unusable.
 */
function validate_email(value){
	const email = typeof value === "string" ? value.trim() : "";

	if(email.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(email)){
		throw errors.bad_request("Please enter a valid email address");
	}

	return email;
}

/**
 * Validates a 6-digit login code's shape before it is hashed and compared. Anything else
 * cannot match a stored code, so it is rejected without touching the database.
 * @param {unknown} value - Raw code from the request body.
 * @returns {string} The trimmed code.
 * @throws {import("./errors.js").AppError} 400 if the code is not six digits.
 */
function validate_code(value){
	const code = typeof value === "string" ? value.trim() : "";

	if(!CODE_REGEX.test(code)){
		throw errors.bad_request("Enter the 6-digit code from your email");
	}

	return code;
}

/**
 * Trims a free-text field and enforces its length cap. Empty comes back as null so a cleared
 * input clears the column rather than storing an empty string.
 * @param {unknown} value - Raw text from the request body.
 * @param {string} label - Field name used in the error message.
 * @param {number} max_length - Maximum allowed length after trimming.
 * @returns {string|null} The trimmed text, or null if it was blank.
 * @throws {import("./errors.js").AppError} 400 if the text is too long.
 */
function validate_text(value, label, max_length){
	const text = typeof value === "string" ? value.trim() : "";

	if(text === "") return null;

	if(text.length > max_length){
		throw errors.bad_request(`${label} must be at most ${max_length} characters`);
	}

	return text;
}

/**
 * Validates a fighter corner against the two the app supports.
 * @param {unknown} value - Raw corner from the request body.
 * @returns {string} The corner.
 * @throws {import("./errors.js").AppError} 400 if the corner is not red or blue.
 */
function validate_corner(value){
	const corner = typeof value === "string" ? value.trim().toLowerCase() : "";

	if(!CORNERS.includes(corner)){
		throw errors.bad_request("Please select a corner");
	}

	return corner;
}

/**
 * Validates a person's given or family name.
 * @param {unknown} value - Raw name from the request body.
 * @param {string} label - Field name used in the error message.
 * @returns {string} The trimmed name.
 * @throws {import("./errors.js").AppError} 400 if the name is empty or too long.
 */
function validate_name(value, label){
	const name = typeof value === "string" ? value.trim() : "";

	if(!name || name.length > MAX_NAME_LENGTH){
		throw errors.bad_request(`${label} is required and must be at most ${MAX_NAME_LENGTH} characters`);
	}

	return name;
}

/**
 * Validates that a value is a UUID before it reaches a uuid-typed column. Postgres raises
 * `invalid input syntax for type uuid` on anything else, which would surface as a 500.
 * @param {unknown} value - Raw id from the request.
 * @param {string} [label="id"] - Field name used in the error message.
 * @returns {string} The id.
 * @throws {import("./errors.js").AppError} 400 if the value is not a UUID.
 */
function validate_uuid(value, label = "id"){
	const id = typeof value === "string" ? value.trim() : "";

	if(!UUID_REGEX.test(id)){
		throw errors.bad_request(`Invalid ${label}`);
	}

	return id;
}

module.exports = {
	MAX_TEXT_LENGTHS,
	validate_uuid,
	validate_username,
	validate_email,
	validate_code,
	validate_text,
	validate_corner,
	validate_name
};
