
const auth_container = document.querySelector('.section-auth');
const visual_container = document.querySelector('.section-visual');
const login_swtich_btn = document.getElementById('login-switch');
const signup_switch_btn = document.getElementById('signup-switch');

//Toggle to login In mode
signup_switch_btn.addEventListener('click', () => {
	auth_container.classList.remove('auth-signup');
	visual_container.classList.remove('visual-signup');

	history.pushState(null, '', '#login');
});

//Toggle to Sign Up mode
login_swtich_btn.addEventListener('click', () => {
	auth_container.classList.add('auth-signup');
	visual_container.classList.add('visual-signup');

	history.pushState(null, '', '#signup');
});


// Auto-check URL hash on page load (e.g. if visiting /auth#signup)
window.addEventListener('DOMContentLoaded', () => {
  if(window.location.hash === '#signup'){
	auth_container.classList.add('auth-signup');
	visual_container.classList.add('visual-signup');
  }
});

window.addEventListener('hashchange', () => {
	if(window.location.hash === '#signup'){
		auth_container.classList.add('auth-signup');
		visual_container.classList.add('visual-signup');
	}

	if(window.location.hash === '#login'){
		auth_container.classList.remove('auth-signup');
		visual_container.classList.remove('visual-signup');
	}
});

//-- Login Elements --//
const login_form = document.getElementById("login-form");
login_form.addEventListener("submit", event => login(event));

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
            headers:{
                "Content-Type": "application/json"
            },
            body: login_creds
        });

		const result = await response.json().catch(() => ({}));

        if(!response.ok){
            const error = new Error(result.message || "An unexpected error occurred.");
            error.status = response.status;
            error.details = result.error || result.message || "Signup failed.";
            throw error;
        }

        //Redirect or handle successful signup here
        window.location.href = "/u/" + result.username;
    } 
    catch(err){
        const statusCode = err.status || "500";
        const message = err.details || err.message || "Network error. Please try again.";

        show_error("Login Failed", statusCode, message);
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

function debounce(func, delay = 350) {
    let timeout_id;
    return (...args) => {
        clearTimeout(timeout_id);
        timeout_id = setTimeout(() => func.apply(this, args), delay);
    };
}

const username_regex = /^[a-zA-Z0-9_-]{3,30}$/;
const reserved_usernames = ['admin', 'api', 'athletes', 'support', 'null', 'undefined', 'system', 'u', 'true', 'false', 'home', 'explore', 'error', 'auth', 'about us', 'upload', 'profile'];

//Validation checker
async function check_username_availability(){
    const username = username_input.value.trim();

	if(!username){
		username_status.style.backgroundImage = "";
		username_input.dataset.status = "";
        return;
    }

    if(username.length < 3 || !username_regex.test(username) || reserved_usernames.includes(username.toLowerCase())){
		set_username_status(false);
        return;
    }

    try{
        const response = await fetch(`/auth/signup-availability?username=${encodeURIComponent(username)}`);

		if(!response.ok){
			set_username_status(false);
			return;
		}

        const data = await response.json();
		set_username_status(Boolean(data.username_available));
    }
	catch(err){
		set_username_status(false);
        console.error("Check failed:", err);
    }
}

function set_username_status(is_valid) {
    username_status.style.backgroundImage = is_valid ? "url('/svg/checkmark.svg')" : "url('/svg/cancel.svg')";
    username_input.dataset.status = is_valid ? "y" : "n";
}

username_input.addEventListener("input", debounce(check_username_availability, 350));

async function check_email_availability(){
    const email = email_input.value.trim();

    if(!email){
		email_status.style.backgroundImage = "";
		email_input.dataset.status = "";
		return;
    }

	if(email.length < 5 || !email_input.checkValidity()){
		set_email_status(false);
		return
	}

    try{
        const response = await fetch(`/auth/signup-availability?email=${encodeURIComponent(email)}`);
		
		if(!response.ok){
			set_email_status(false);
			return;
		}

		const data = await response.json();
		set_email_status(Boolean(data.email_available));
    }
	catch(err){
		set_email_status(false);
        console.error("Check failed:", err);
    }
}

function set_email_status(is_valid) {
    email_status.style.backgroundImage = is_valid ? "url('/svg/checkmark.svg')" : "url('/svg/cancel.svg')";
    email_input.dataset.status = is_valid ? "y" : "n";
}

email_input.addEventListener("input", debounce(check_email_availability, 350));

function check_password_availability(){
    const password = password_input.value;

    if(!password){
		password_status.style.backgroundImage = "";
		password_input.dataset.status = "";
		return;
    }

    if(password.length < 8){
		set_password_status(false);
	}
	else{
		set_password_status(true);
	}
}

function set_password_status(is_valid) {
    password_status.style.backgroundImage = is_valid ? "url('/svg/checkmark.svg')" : "url('/svg/cancel.svg')";
    password_input.dataset.status = is_valid ? "y" : "n";
}

password_input.addEventListener("input", debounce(check_password_availability, 350));

signup_form.addEventListener("submit", event => signup(event));

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

	if(user_username.length < 3 || user_username.length > 30) {
		show_error("Registration Failed", "400", "Username must be between 3 and 30 characters");
		return;
	}

	//2. Character format check
	if(!username_regex.test(user_username)) {
		show_error("Registration Failed", "400", "Username can only contain letters, numbers, underscores, and hyphens");
		return;
	}

	//3. Reserved keyword check
	if(reserved_usernames.includes(user_username.toLowerCase())) {
		show_error("Registration Failed", "400", "This username is reserved and cannot be registered");
		return;
	}

	//4. Server availability check
	if(username_input.dataset.status !== "y") {
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
        id: "",
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
            headers:{
                "Content-Type": "application/json"
            },
            body: payload
        });

		const result = await response.json().catch(() => ({}));

        if(!response.ok){
            const error = new Error(result.message || "An unexpected error occurred.");
            error.status = response.status;
            error.details = result.error || result.message || "Signup failed.";
            throw error;
        }

        //Redirect or handle successful signup here
        window.location.href = "/u/" + user_username;
    }
	catch(err){
        const statusCode = err.status || "500";
        const message = err.details || err.message || "Network error. Please try again.";

        show_error("Registration Failed", statusCode, message);
    }
}