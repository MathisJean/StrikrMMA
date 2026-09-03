
import { init_steps } from "/js/steps.js";
import { attach_field_checks } from "/js/field_checks.js";

const claim_flow = document.getElementById("claim-flow");
const track = document.getElementById("claim-track");
const decline_btn = document.getElementById("claim-decline-btn");

//Only the "ready" state renders the flow; the other states are static messages.
if(claim_flow && track){
	const send_btn = document.getElementById("claim-send-btn");
	const sent_email = document.getElementById("claim-sent-email");

	const email_input = document.getElementById("email-input");
	const email_status = document.getElementById("email-status");

	const code_form = document.getElementById("code-form");
	const code_btn = document.getElementById("code-btn");
	const code_input = document.getElementById("code-input");
	const resend_btn = document.getElementById("resend-btn");

	attach_field_checks({ email_input, email_status });

	//Kept from the successful send so the code and any resend use the address the link went to.
	let requested_email = "";

	const steps = init_steps(track, {
		on_leave: (from_step, to_step) => {
			//Step 3 says "we sent you a link", so it is only reachable once one actually is.
			if(to_step === 3 && !requested_email) return false;

			return true;
		}
	});

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
	 * Asks the server to email a login link for this claim, and moves to the code step.
	 * @param {string} email - Address to send the login to.
	 * @returns {Promise<boolean>} Whether the request succeeded.
	 */
	async function send_claim_link(email){
		try{
			const response = await fetch("/claim/start", {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({ token: claim_flow.dataset.token, email })
			});

			if(!response.ok) throw await response_error(response, "Could not send a login link.");

			requested_email = email;
			sent_email.textContent = email;
			steps.go_to(3);

			return true;
		}
		catch(err){
			show_error("Claim Failed", err.status || "500", err.message || "Network error. Please try again.");
			return false;
		}
	}

	send_btn.addEventListener("click", async() => {
		const email = email_input.value.trim();

		if(!email || !email_input.checkValidity()){
			show_error("Claim Failed", "400", "Please enter a valid email address");
			return;
		}

		send_btn.disabled = true;

		if(!await send_claim_link(email)) send_btn.disabled = false;
	});

	//The claim's link is an ordinary magic_link token, so /auth's endpoint completes it.
	code_form.addEventListener("submit", async(event) => {
		event.preventDefault();

		const code = code_input.value.trim();

		if(!/^[0-9]{6}$/.test(code)){
			show_error("Claim Failed", "400", "Enter the 6-digit code from your email");
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
			show_error("Claim Failed", err.status || "500", err.message || "Network error. Please try again.");
			code_btn.disabled = false;
		}
	});

	resend_btn.addEventListener("click", async() => {
		if(!requested_email) return;

		//A resend retires the previous code, so the stale one is cleared rather than left looking usable.
		code_input.value = "";

		if(await send_claim_link(requested_email)){
			show_error("Link Sent", "", `A new login link is on its way to ${requested_email}.`, false, false);
		}
	});
}

decline_btn?.addEventListener("click", () => decline_claim());

/**
 * Confirms and submits a claim decline, which permanently deletes the placeholder profile.
 * @returns {Promise<void>}
 */
async function decline_claim(){
	if(!confirm("Are you sure this isn't you? This profile will be permanently deleted.")) return; //TODO: Switch from alarm to styled popup

	try{
		const response = await fetch("/claim/decline", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ token: claim_flow.dataset.token })
		});

		const result = await response.json().catch(() => ({}));

		if(!response.ok){
			const error = new Error(result.error || "Failed to decline");
			error.status = response.status;
			error.details = result.error || "Failed to decline";
			throw error;
		}

		claim_flow.innerHTML = "";

		const title = document.createElement("h1");
		title.className = "auth-title";
		title.textContent = "PROFILE REMOVED";

		const description = document.createElement("p");
		description.className = "auth-description";
		description.textContent = "Thanks for letting us know.";

		const actions = document.createElement("div");
		actions.className = "auth-submit-wrap";

		const home = document.createElement("a");
		home.id = "claim-home-btn";
		home.className = "solid-btn";
		home.href = "/home";
		home.textContent = "GO HOME";

		actions.appendChild(home);
		claim_flow.append(title, description, actions);
	}
	catch(err){
		const status_code = err.status || "500";
		const message = err.details || err.message || "Network error. Please try again.";

		show_error("Decline Failed", status_code, message);
	}
}
