
import { attach_field_checks, USERNAME_REGEX, RESERVED_USERNAMES } from "/js/field_checks.js";

const auth_container = document.querySelector(".section-auth");
const visual_container = document.querySelector(".section-visual");
const login_switch_btn = document.getElementById("login-switch");
const signup_switch_btn = document.getElementById("signup-switch");

//Toggle to login In mode
signup_switch_btn.addEventListener("click", () => {
	auth_container.classList.remove("auth-signup");
	visual_container.classList.remove("visual-signup");

	history.pushState(null, "", "#login");
});

//Toggle to Sign Up mode
login_switch_btn.addEventListener("click", () => {
	auth_container.classList.add("auth-signup");
	visual_container.classList.add("visual-signup");

	history.pushState(null, "", "#signup");
});

// Auto-check URL hash on page load (e.g. if visiting /auth#signup)
window.addEventListener("DOMContentLoaded", () => {
	if(window.location.hash === "#signup"){
		auth_container.classList.add("auth-signup");
		visual_container.classList.add("visual-signup");
	}
});

window.addEventListener("hashchange", () => {
	if(window.location.hash === "#signup"){
		auth_container.classList.add("auth-signup");
		visual_container.classList.add("visual-signup");
	}

	if(window.location.hash === "#login"){
		auth_container.classList.remove("auth-signup");
		visual_container.classList.remove("visual-signup");
	}
});

//-- Login Elements --//
const login_form = document.getElementById("login-form");
login_form.addEventListener("submit", event => login(event));

/**
 * Submits the login form and redirects to the user's profile on success.
 * @param {SubmitEvent} event - The form submit event.
 * @returns {Promise<void>}
 */
async function login(event){
	event.preventDefault();

	//Create form
	let user_email = login_form.querySelector("input[type='email']").value || "";
	let user_password = login_form.querySelector("input[type='password']").value || "";

	if(user_email === "" || user_password === ""){
		show_error("Login Failed", "401", "Invalid credentials");
		return;
	}

	const login_creds = JSON.stringify({
		email: user_email,
		password: user_password
	});

	try{
		const response = await fetch("/auth/login", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: login_creds
		});

		const result = await response.json().catch(() => ({}));

		if(!response.ok){
			//The server replies with { error }, so that is the field to read.
			const error = new Error(result.error || "An unexpected error occurred.");
			error.status = response.status;
			error.details = result.error || "Login failed.";
			throw error;
		}

		window.location.href = "/u/" + result.username;
	}
	catch(err){
		const status_code = err.status || "500";
		const message = err.details || err.message || "Network error. Please try again.";

		show_error("Login Failed", status_code, message);
	}
}

//-- Signup Elements --//
const signup_form = document.getElementById("signup-form");

const first_name_input = document.getElementById("namef-input");
const last_name_input = document.getElementById("namel-input");

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

signup_form.addEventListener("submit", event => signup(event));

/**
 * Validates the signup form client-side and submits it, redirecting to the new profile on success.
 * @param {SubmitEvent} event - The form submit event.
 * @returns {Promise<void>}
 */
async function signup(event){
	event.preventDefault();

	let user_first_name = first_name_input?.value.trim() || "";
	let user_last_name = last_name_input?.value.trim() || "";
	let user_corner = signup_form.querySelector("input[name='input-corner']:checked")?.value.trim() || "";
	let user_username = username_input?.value.trim() || "";
	let user_email = email_input?.value.trim() || "";
	let user_password = password_input?.value || "";

	if(!user_corner){
		show_error("Registration Failed", "400", "Please select a corner");
		return;
	}

	if(!user_first_name){
		show_error("Registration Failed", "400", "Please enter your given name");
		return;
	}

	if(!user_last_name){
		show_error("Registration Failed", "400", "Please enter your family name");
		return;
	}

	if(user_username.length < 3 || user_username.length > 30){
		show_error("Registration Failed", "400", "Username must be between 3 and 30 characters");
		return;
	}

	//2. Character format check
	if(!USERNAME_REGEX.test(user_username)){
		show_error("Registration Failed", "400", "Username can only contain letters, numbers, underscores, and hyphens");
		return;
	}

	//3. Reserved keyword check
	if(RESERVED_USERNAMES.includes(user_username.toLowerCase())){
		show_error("Registration Failed", "400", "This username is reserved and cannot be registered");
		return;
	}

	//4. Server availability check
	if(username_input.dataset.status !== "y"){
		show_error("Registration Failed", "400", "Username is already taken");
		return;
	}

	if(email_input.dataset.status !== "y"){
		show_error("Registration Failed", "400", "Invalid or unavailable email address");
		return;
	}

	if(password_input.dataset.status !== "y"){
		show_error("Registration Failed", "400", "Password must be at least 8 characters long");
		return;
	}

	const payload = JSON.stringify({
		corner: user_corner,
		first_name: user_first_name,
		last_name: user_last_name,
		username: user_username,
		email: user_email,
		password: user_password
	});

	try{
		const response = await fetch("/auth/signup", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: payload
		});

		const result = await response.json().catch(() => ({}));

		if(!response.ok){
			const error = new Error(result.error || "An unexpected error occurred.");
			error.status = response.status;
			error.details = result.error || "Signup failed.";
			throw error;
		}

		window.location.href = "/u/" + user_username;
	}
	catch(err){
		const status_code = err.status || "500";
		const message = err.details || err.message || "Network error. Please try again.";

		show_error("Registration Failed", status_code, message);
	}
}
