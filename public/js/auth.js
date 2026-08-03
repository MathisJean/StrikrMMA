import { GET, POST, PUT, DELETE} from "./http_requests.js";

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

//Change focus on user inputs
Array.from(document.querySelectorAll(".auth .user_input")).forEach((input, index, inputs) =>
{
    input.addEventListener("keydown", (event) => 
    {
        if(event.key === "Enter")
        {
            //Move to the next input if available
            if(index < inputs.length - 1) 
            {
                event.preventDefault(); //Prevent form submission

                inputs[index + 1].focus();
                inputs[index + 1].select();
            };
        }
    });
});

//-- Login Elements --//
const login_form = document.getElementById("login-form");

login_form.addEventListener("submit", event => login(event));
const login_error_output = login_form.querySelector(".err-output");

async function login(event){
    event.preventDefault();

    //Create form
    const form_data = new FormData();

    let user_email = login_form.querySelector("input[type='email']").value;
    let user_password = login_form.querySelector("input[type='password']").value;

    const login_creds = JSON.stringify({
        password: user_password,
        email: user_email    
    });

    try{
        const data = await fetch("/auth/login", {
            method: "POST",
            headers:{
                "Content-Type": "application/json"
            },
            body: login_creds
        });

        if(data.status !== 200){
            login_error_output.textContent = data.error;
            return;
        }

        window.location.assign("/home");
    } 
    catch(err){
        console.error(err);
    }
}

//-- Signup Elements --//
const signup_form = document.getElementById("signup-form");

signup_form.addEventListener("submit", event => signup(event));

async function signup(event){
    event.preventDefault();

	let user_corner = signup_form.querySelector("input[name='input-corner']:checked")?.value || "";
    let user_username = signup_form.querySelector("input[type='text']")?.value || "";
    let user_email = signup_form.querySelector("input[type='email']")?.value || "";
    let user_password = signup_form.querySelector("input[type='password']")?.value || "";

    const payload = JSON.stringify({
        id: "",
        corner: user_corner,
        username: user_username,
        email: user_email,    
        password: user_password
    });

    try{
        const data = await fetch("/auth/signup", {
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