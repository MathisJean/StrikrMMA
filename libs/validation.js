
//Set up libraries
const errors = require('./errors.js');

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 50;

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
 * Validates a password's length. Not trimmed — leading/trailing spaces are part of the secret.
 * @param {unknown} value - Raw password from the request body.
 * @returns {string} The password.
 * @throws {import("./errors.js").AppError} 400 if the password is unusable.
 */
function validate_password(value){
	const password = typeof value === "string" ? value : "";

	if(password.length < MIN_PASSWORD_LENGTH){
		throw errors.bad_request(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
	}

	//bcrypt silently ignores bytes past 72; rejecting outright beats truncating a user's password.
	if(password.length > MAX_PASSWORD_LENGTH){
		throw errors.bad_request(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
	}

	return password;
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
	validate_uuid,
	validate_username,
	validate_email,
	validate_password,
	validate_corner,
	validate_name
};
