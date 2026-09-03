
import { init_steps } from "/js/steps.js";
import { attach_field_checks, USERNAME_REGEX, RESERVED_USERNAMES } from "/js/field_checks.js";

const track = document.getElementById("onboarding-track");
const summary = document.getElementById("onboarding-summary");
const finish_btn = document.getElementById("finish-btn");
const step2_next = document.getElementById("step2-next");

const first_name_input = document.getElementById("namef-input");
const last_name_input = document.getElementById("namel-input");

const username_input = document.getElementById("username-input");
const username_status = document.getElementById("username-status");

const nickname_input = document.getElementById("nickname-input");
const stance_input = document.getElementById("stance-input");
const hometown_input = document.getElementById("hometown-input");
const team_input = document.getElementById("team-input");

attach_field_checks({ username_input, username_status });

/**
 * Reads everything collected across the flow's steps into one payload. Nothing is saved
 * per-step: the whole account is written by a single request at the end, so closing the tab
 * halfway through leaves no half-built profile behind.
 * @returns {object} The onboarding payload.
 */
function collect(){
	return {
		corner: document.querySelector("input[name='input-corner']:checked")?.value || "",
		first_name: first_name_input.value.trim(),
		last_name: last_name_input.value.trim(),
		username: username_input.value.trim(),
		nickname: nickname_input.value.trim(),
		stance: stance_input.value,
		hometown: hometown_input.value.trim(),
		team: team_input.value.trim()
	};
}

/**
 * Checks the fields Step 2 requires, reporting the first problem. Mirrors
 * libs/validation.js — these checks only pre-empt the error for the user, the server is
 * what actually decides.
 * @returns {boolean} Whether Step 2 may be left.
 */
function validate_identity(){
	const { corner, first_name, last_name, username } = collect();

	if(!corner){
		show_error("Setup", "400", "Please select a corner");
		return false;
	}

	if(!first_name){
		show_error("Setup", "400", "Please enter your given name");
		return false;
	}

	if(!last_name){
		show_error("Setup", "400", "Please enter your family name");
		return false;
	}

	if(!USERNAME_REGEX.test(username)){
		show_error("Setup", "400", "Username must be 3-30 characters, using only letters, numbers, underscores, and hyphens");
		return false;
	}

	if(RESERVED_USERNAMES.includes(username.toLowerCase())){
		show_error("Setup", "400", "This username is reserved and cannot be registered");
		return false;
	}

	if(username_input.dataset.status !== "y"){
		show_error("Setup", "400", "Username is already taken");
		return false;
	}

	return true;
}

const steps = init_steps(track, {
	on_leave: (from_step, to_step) => {
		//Only guard forward motion — going back to fix something must never be blocked by
		//the very field the user is going back to fix.
		if(to_step < from_step) return true;

		if(from_step === 2) return validate_identity();

		return true;
	},
	on_enter: (step) => {
		if(step === 4) render_summary();
	}
});

step2_next.addEventListener("click", () => steps.next());

finish_btn.addEventListener("click", async() => {
	//Step 2's fields are the only required ones, and Step 3 is skippable straight past them,
	//so they are re-checked here rather than trusted to have been validated on the way through.
	if(!validate_identity()){
		steps.go_to(2);
		return;
	}

	finish_btn.disabled = true;

	try{
		const response = await fetch("/onboarding/complete", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(collect())
		});

		const result = await response.json().catch(() => ({}));

		if(!response.ok){
			const error = new Error(result.error || "Could not finish setting up your account.");
			error.status = response.status;
			throw error;
		}

		window.location.href = result.redirect;
	}
	catch(err){
		show_error("Setup Failed", err.status || "500", err.message || "Network error. Please try again.");
		finish_btn.disabled = false;
	}
});
