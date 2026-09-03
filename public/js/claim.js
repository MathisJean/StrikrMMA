
import { init_steps } from "/js/steps.js";
import { attach_field_checks } from "/js/field_checks.js";

const claim_flow = document.getElementById("claim-flow");
const track = document.getElementById("claim-track");
const decline_btn = document.getElementById("claim-decline-btn");

//Only the "ready" state renders the flow; the invalid and already-claimed states are static
//messages with none of this on the page.
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

	let email_sent = false;

	const steps = init_steps(track, {
		on_leave: (from_step, to_step) => {
			//Step 3 says "we sent you a link", so it is only reachable once one actually is.
			if(to_step === 3 && !email_sent) return false;

			return true;
		}
	});

	send_btn.addEventListener("click", async() => {
		const email = email_input.value.trim();

		if(!email || !email_input.checkValidity()){
			show_error("Claim Failed", "400", "Please enter a valid email address");
			return;
		}

		send_btn.disabled = true;

		try{
			const response = await fetch("/claim/start", {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({ token: claim_flow.dataset.token, email })
			});

			const result = await response.json().catch(() => ({}));

			if(!response.ok){
				const error = new Error(result.error || "Could not send a login link.");
				error.status = response.status;
				throw error;
			}

			sent_email.textContent = email;

			//The button stays disabled: this step is finished, and the claim continues in
			//the athlete's inbox now.
			email_sent = true;
			steps.go_to(3);
		}
		catch(err){
			show_error("Claim Failed", err.status || "500", err.message || "Network error. Please try again.");
			send_btn.disabled = false;
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
