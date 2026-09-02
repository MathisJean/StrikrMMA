
import { attach_field_checks } from "/js/field_checks.js";

const claim_form = document.getElementById("claim-form");
const decline_btn = document.getElementById("claim-decline-btn");

const username_input = document.getElementById("username-input");
const username_status = document.getElementById("username-status");

const email_input = document.getElementById("email-input");
const email_status = document.getElementById("email-status");

const password_input = document.getElementById("password-input");
const password_status = document.getElementById("password-status");

attach_field_checks({
	username_input, username_status,
	email_input, email_status,
	password_input, password_status
});

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
