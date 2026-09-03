
//The login/signup slider and its #hash routing are gone: there is only one form here now,
//so there are no two states left for a slide to distinguish. The slider technique moved to
//onboarding and claim (see /js/steps.js), where there are real sequential steps.

const request_form = document.getElementById("request-form");
const request_btn = document.getElementById("request-btn");
const email_input = document.getElementById("email-input");

const sent_panel = document.getElementById("sent-panel");
const sent_email = document.getElementById("sent-email");

const code_form = document.getElementById("code-form");
const code_btn = document.getElementById("code-btn");
const code_input = document.getElementById("code-input");
const resend_btn = document.getElementById("resend-btn");

//Kept from the successful request so the code submission and any resend use exactly the
//address the link was sent to, not whatever is in the input by then.
let requested_email = "";

//Reasons /auth/verify can bounce someone back here. The link is the one part of this flow
//that lands as a full page load, so its failures arrive as a query parameter.
const VERIFY_ERRORS = {
	missing_token: "That link was incomplete. Request a new one.",
	invalid_or_expired: "That link has expired or was already used. Request a new one.",
	email_taken: "That email is already registered to another account. Log in with it directly.",
	session_error: "Something went wrong starting your session. Please try again."
};

const error_param = new URLSearchParams(window.location.search).get("error");

if(error_param && VERIFY_ERRORS[error_param]){
	show_error("Login Failed", "", VERIFY_ERRORS[error_param], false);

	//Cleared so a refresh doesn't replay the same message.
	window.history.replaceState({}, "", window.location.pathname);
}

/**
 * Reads a fetch response's JSON error body, falling back to a generic message.
 * @param {Response} response - The fetch response.
 * @param {string} fallback - Message to use when the body carries none.
 * @returns {Promise<Error>} An error carrying the status and message.
 */
async function response_error(response, fallback){
	const result = await response.json().catch(() => ({}));

	const error = new Error(result.error || fallback);
	error.status = response.status;

	return error;
}

/**
 * Requests a login link and code for an address, and swaps the page over to the
 * check-your-email panel on success.
 * @param {string} email - Address to send the login to.
 * @returns {Promise<boolean>} Whether the request succeeded.
 */
async function request_link(email){
	try{
		const response = await fetch("/auth/request-link", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ email })
		});

		if(!response.ok) throw await response_error(response, "Could not send a login link.");

		requested_email = email;
		sent_email.textContent = email;

		request_form.hidden = true;
		sent_panel.hidden = false;
		code_input.focus();

		return true;
	}
	catch(err){
		show_error("Login Failed", err.status || "500", err.message || "Network error. Please try again.");
		return false;
	}
}

request_form.addEventListener("submit", async(event) => {
	event.preventDefault();

	const email = email_input.value.trim();

	if(!email || !email_input.checkValidity()){
		show_error("Login Failed", "400", "Please enter a valid email address");
		return;
	}

	//The button is disabled for the round trip so an impatient double-click cannot spend two
	//of the five requests the rate limiter allows.
	request_btn.disabled = true;

	await request_link(email);

	request_btn.disabled = false;
});

code_form.addEventListener("submit", async(event) => {
	event.preventDefault();

	const code = code_input.value.trim();

	if(!/^[0-9]{6}$/.test(code)){
		show_error("Login Failed", "400", "Enter the 6-digit code from your email");
		return;
	}

	code_btn.disabled = true;

	try{
		const response = await fetch("/auth/verify-code", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ email: requested_email, code })
		});

		if(!response.ok) throw await response_error(response, "That code didn't work.");

		const result = await response.json();

		window.location.href = result.redirect;
	}
	catch(err){
		show_error("Login Failed", err.status || "500", err.message || "Network error. Please try again.");
		code_btn.disabled = false;
	}
});

resend_btn.addEventListener("click", async() => {
	if(!requested_email) return;

	//A resend invalidates the previous code, so the stale one is cleared rather than left
	//sitting in the field looking usable.
	code_input.value = "";

	if(await request_link(requested_email)){
		show_error("Link Sent", "", `A new login link is on its way to ${requested_email}.`, false, false);
	}
});
