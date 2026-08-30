
const claim_form = document.getElementById("claim-form");
const decline_btn = document.getElementById("claim-decline-btn");

const username_input = document.getElementById("username-input");
const username_status = document.getElementById("username-status");

const email_input = document.getElementById("email-input");
const email_status = document.getElementById("email-status");

const password_input = document.getElementById("password-input");
const password_status = document.getElementById("password-status");

const username_regex = /^[a-zA-Z0-9_-]{3,30}$/;
const reserved_usernames = ["admin", "api", "athletes", "support", "null", "undefined", "system", "u", "true", "false", "home", "explore", "error", "auth", "claim", "upload", "profile"];

/**
 * Wraps a function so repeated calls within `delay` ms collapse into a single trailing call.
 * @param {Function} func - Function to debounce.
 * @param {number} [delay=350] - Delay in milliseconds.
 * @returns {Function} Debounced version of func.
 */
function debounce(func, delay = 350){
	let timeout_id;
	return (...args) => {
		clearTimeout(timeout_id);
		timeout_id = setTimeout(() => func.apply(this, args), delay);
	};
}

/**
 * Updates a field's status icon and dataset flag.
 * @param {HTMLElement} status_el - Status icon element.
 * @param {HTMLElement} input_el - Input element.
 * @param {boolean} is_valid - Whether the field is currently valid.
 * @returns {void}
 */
function set_field_status(status_el, input_el, is_valid){
	status_el.style.backgroundImage = is_valid ? "url('/svg/checkmark.svg')" : "url('/svg/cancel.svg')";
	input_el.dataset.status = is_valid ? "y" : "n";
}

/**
 * Checks the current username input against format rules and server-side availability.
 * @returns {Promise<void>}
 */
async function check_username_availability(){
	const username = username_input.value.trim();

	if(!username){
		username_status.style.backgroundImage = "";
		username_input.dataset.status = "";
		return;
	}

	if(username.length < 3 || !username_regex.test(username) || reserved_usernames.includes(username.toLowerCase())){
		set_field_status(username_status, username_input, false);
		return;
	}

	try{
		const response = await fetch(`/auth/signup-availability?username=${encodeURIComponent(username)}`);
		const data = await response.json();
		set_field_status(username_status, username_input, response.ok && Boolean(data.username_available));
	}
	catch(err){
		set_field_status(username_status, username_input, false);
		console.error("Check failed:", err);
	}
}

/**
 * Checks the current email input against basic validity and server-side availability.
 * @returns {Promise<void>}
 */
async function check_email_availability(){
	const email = email_input.value.trim();

	if(!email){
		email_status.style.backgroundImage = "";
		email_input.dataset.status = "";
		return;
	}

	if(!email_input.checkValidity()){
		set_field_status(email_status, email_input, false);
		return;
	}

	try{
		const response = await fetch(`/auth/signup-availability?email=${encodeURIComponent(email)}`);
		const data = await response.json();
		set_field_status(email_status, email_input, response.ok && Boolean(data.email_available));
	}
	catch(err){
		set_field_status(email_status, email_input, false);
		console.error("Check failed:", err);
	}
}

/**
 * Checks the current password input against the minimum length requirement.
 * @returns {void}
 */
function check_password_availability(){
	const password = password_input.value;

	if(!password){
		password_status.style.backgroundImage = "";
		password_input.dataset.status = "";
		return;
	}

	set_field_status(password_status, password_input, password.length >= 8);
}

username_input?.addEventListener("input", debounce(check_username_availability, 350));
email_input?.addEventListener("input", debounce(check_email_availability, 350));
password_input?.addEventListener("input", debounce(check_password_availability, 350));

claim_form?.addEventListener("submit", event => accept_claim(event));

/**
 * Validates the claim form client-side and submits the accept request, redirecting
 * to the new profile on success.
 * @param {SubmitEvent} event - The form submit event.
 * @returns {Promise<void>}
 */
async function accept_claim(event){
	event.preventDefault();

	const token = claim_form.dataset.token;
	const corner = claim_form.querySelector("input[name='input-corner']:checked")?.value.trim() || "";
	const username = username_input?.value.trim() || "";
	const email = email_input?.value.trim() || "";
	const password = password_input?.value || "";

	if(!corner){
		show_error("Claim Failed", "400", "Please select a corner");
		return;
	}

	if(username_input.dataset.status !== "y"){
		show_error("Claim Failed", "400", "Username is unavailable or invalid");
		return;
	}

	if(email_input.dataset.status !== "y"){
		show_error("Claim Failed", "400", "Invalid or unavailable email address");
		return;
	}

	if(password_input.dataset.status !== "y"){
		show_error("Claim Failed", "400", "Password must be at least 8 characters long");
		return;
	}

	try{
		const response = await fetch("/claim/accept", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ token, username, email, password, corner })
		});

		const result = await response.json().catch(() => ({}));

		if(!response.ok){
			const error = new Error(result.error || "Claim failed.");
			error.status = response.status;
			error.details = result.error || "Claim failed.";
			throw error;
		}

		window.location.href = "/u/" + result.username;
	}
	catch(err){
		const status_code = err.status || "500";
		const message = err.details || err.message || "Network error. Please try again.";

		show_error("Claim Failed", status_code, message);
	}
}

decline_btn?.addEventListener("click", () => decline_claim());

/**
 * Confirms and submits a claim decline, which permanently deletes the placeholder profile.
 * @returns {Promise<void>}
 */
async function decline_claim(){
	if(!confirm("Are you sure this isn't you? This profile will be permanently deleted.")) return; //TODO: Switch from alarm to styled popup

	const token = claim_form.dataset.token;

	try{
		const response = await fetch("/claim/decline", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ token })
		});

		const result = await response.json().catch(() => ({}));

		if(!response.ok){
			const error = new Error(result.error || "Failed to decline");
			error.status = response.status;
			error.details = result.error || "Failed to decline";
			throw error;
		}

		claim_form.innerHTML = `
			<h1 class=\"auth-title\">PROFILE REMOVED</h1>
			<p class=\"auth-description\">Thanks for letting us know.</p>

			<div class="auth-submit-wrap">
				<a id="claim-home-btn" class="solid-btn" href="/home">GO HOME</a>
			</div>
		`;
	}
	catch(err){
		const status_code = err.status || "500";
		const message = err.details || err.message || "Network error. Please try again.";

		show_error("Decline Failed", status_code, message);
	}
}
