
//Shared signup/claim field validation. Both /auth and /claim create a real account and so
//enforce the same rules; this module is the single copy. These checks only pre-empt the
//error for the user — libs/validation.js on the server is what actually decides.

export const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
export const MIN_PASSWORD_LENGTH = 8;

//Keep in sync with RESERVED_USERNAMES in libs/validation.js.
export const RESERVED_USERNAMES = [
	"admin", "api", "athletes", "auth", "claim", "error", "explore", "false", "home",
	"null", "profile", "report", "settings", "strikr", "support", "system", "true",
	"u", "undefined", "upload"
];

/**
 * Wraps a function so repeated calls within `delay` ms collapse into a single trailing call.
 * @param {Function} func - Function to debounce.
 * @param {number} [delay=350] - Delay in milliseconds.
 * @returns {Function} Debounced version of func.
 */
export function debounce(func, delay = 350){
	let timeout_id;

	return (...args) => {
		clearTimeout(timeout_id);
		timeout_id = setTimeout(() => func(...args), delay);
	};
}

/**
 * Updates a field's status icon and its `data-status` flag, which the submit handlers read
 * to decide whether the form may be sent.
 * @param {HTMLElement} status_el - Status icon element.
 * @param {HTMLElement} input_el - Input element.
 * @param {boolean} is_valid - Whether the field is currently valid.
 * @returns {void}
 */
export function set_field_status(status_el, input_el, is_valid){
	status_el.style.backgroundImage = is_valid ? "url('/svg/checkmark.svg')" : "url('/svg/cancel.svg')";
	input_el.dataset.status = is_valid ? "y" : "n";
}

/**
 * Clears a field's status icon and flag, used when the input is emptied.
 * @param {HTMLElement} status_el - Status icon element.
 * @param {HTMLElement} input_el - Input element.
 * @returns {void}
 */
function clear_field_status(status_el, input_el){
	status_el.style.backgroundImage = "";
	input_el.dataset.status = "";
}

/**
 * Asks the server whether a username or email is still free.
 * @param {"username"|"email"} field - Which field to check.
 * @param {string} value - Value to check.
 * @returns {Promise<boolean>} True if available.
 */
async function is_available(field, value){
	const response = await fetch(`/auth/signup-availability?${field}=${encodeURIComponent(value)}`);

	if(!response.ok) return false;

	const data = await response.json();

	return Boolean(field === "username" ? data.username_available : data.email_available);
}

/**
 * Wires debounced live validation onto the username, email, and password fields of a
 * signup-style form. Elements that aren't present on the page are skipped.
 * @param {object} fields
 * @param {HTMLInputElement} [fields.username_input] - Username input.
 * @param {HTMLElement} [fields.username_status] - Username status icon.
 * @param {HTMLInputElement} [fields.email_input] - Email input.
 * @param {HTMLElement} [fields.email_status] - Email status icon.
 * @param {HTMLInputElement} [fields.password_input] - Password input.
 * @param {HTMLElement} [fields.password_status] - Password status icon.
 * @returns {void}
 */
export function attach_field_checks({ username_input, username_status, email_input, email_status, password_input, password_status }){
	if(username_input && username_status){
		username_input.addEventListener("input", debounce(async() => {
			const username = username_input.value.trim();

			if(!username) return clear_field_status(username_status, username_input);

			if(!USERNAME_REGEX.test(username) || RESERVED_USERNAMES.includes(username.toLowerCase())){
				return set_field_status(username_status, username_input, false);
			}

			try{
				set_field_status(username_status, username_input, await is_available("username", username));
			}
			catch(err){
				set_field_status(username_status, username_input, false);
				console.error("Username check failed:", err);
			}
		}));
	}

	if(email_input && email_status){
		email_input.addEventListener("input", debounce(async() => {
			const email = email_input.value.trim();

			if(!email) return clear_field_status(email_status, email_input);

			if(!email_input.checkValidity()){
				return set_field_status(email_status, email_input, false);
			}

			try{
				set_field_status(email_status, email_input, await is_available("email", email));
			}
			catch(err){
				set_field_status(email_status, email_input, false);
				console.error("Email check failed:", err);
			}
		}));
	}

	if(password_input && password_status){
		password_input.addEventListener("input", debounce(() => {
			const password = password_input.value;

			if(!password) return clear_field_status(password_status, password_input);

			set_field_status(password_status, password_input, password.length >= MIN_PASSWORD_LENGTH);
		}));
	}
}
