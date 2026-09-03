
//Shared username/email field validation for the onboarding and claim flows. These checks
//only pre-empt the error for the user — libs/validation.js on the server is what actually
//decides.

export const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

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
 * Asks the server whether a username is still free.
 * @param {string} username - Username to check.
 * @returns {Promise<boolean>} True if available.
 */
async function is_available(username){
	//Lives under /api rather than /auth: onboarding calls it with a session already in
	//place, and the auth routes turn a logged-in caller away.
	const response = await fetch(`/api/username-availability?username=${encodeURIComponent(username)}`);

	if(!response.ok) return false;

	const data = await response.json();

	return Boolean(data.username_available);
}

/**
 * Wires debounced live validation onto the username and email fields of a setup form.
 * Elements that aren't present on the page are skipped.
 * @param {object} fields
 * @param {HTMLInputElement} [fields.username_input] - Username input.
 * @param {HTMLElement} [fields.username_status] - Username status icon.
 * @param {HTMLInputElement} [fields.email_input] - Email input.
 * @param {HTMLElement} [fields.email_status] - Email status icon.
 * @returns {void}
 */
export function attach_field_checks({ username_input, username_status, email_input, email_status }){
	if(username_input && username_status){
		username_input.addEventListener("input", debounce(async() => {
			const username = username_input.value.trim();

			if(!username) return clear_field_status(username_status, username_input);

			if(!USERNAME_REGEX.test(username) || RESERVED_USERNAMES.includes(username.toLowerCase())){
				return set_field_status(username_status, username_input, false);
			}

			try{
				set_field_status(username_status, username_input, await is_available(username));
			}
			catch(err){
				set_field_status(username_status, username_input, false);
				console.error("Username check failed:", err);
			}
		}));
	}

	//Shape only. Whether an address is already registered is deliberately not checked here:
	//an endpoint answering that question turns any form into a way to ask which emails have
	//Strikr accounts. The server reports the collision when it matters.
	if(email_input && email_status){
		email_input.addEventListener("input", debounce(() => {
			const email = email_input.value.trim();

			if(!email) return clear_field_status(email_status, email_input);

			set_field_status(email_status, email_input, email_input.checkValidity());
		}));
	}
}
