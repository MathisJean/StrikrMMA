import { GET, POST, PUT, DELETE} from "./http_requests.js";

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

//Change focus on authentication inputs
Array.from(document.querySelectorAll("#signup-form .char-input")).forEach((input, index, inputs) =>
{
    input.addEventListener("input", (event) => 
    {
        if(event.inputType === "insertText" && event.data.match(/^[0-9]$/)) 
        {
            //Move to the next input if available
            if(index < inputs.length - 1) 
            {
                inputs[index + 1].focus();
                inputs[index + 1].select();
            };
        }
    });

    input.addEventListener("keydown", (event) => 
    {
        if(event.key === "Backspace" && input.value === "") 
        {
            //Move to the prev input if available
            if(index > 0) 
            {
                inputs[index - 1].focus();
                inputs[index - 1].value = "";
            };
        };
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

const signup_user_inputs = signup_form.querySelectorAll(".user-input");
const auth_code_div = signup_form.querySelector(".auth-code-input");
const auth_inputs = signup_form.querySelectorAll(".char-input");

const signup_error_output = signup_form.querySelector(".err-output");
const link_btn = signup_form.querySelector(".link");
const expiry_el = signup_form.querySelector("#auth-expiry");

const confirm_btn = signup_form.querySelector("#confirm-auth");
const signup_btn = signup_form.querySelector("#signup-btn");

let auth_code = "";
let payload = null; // store for confirm

signup_form.addEventListener("submit", event => signup(event));

async function signup(event){
    event.preventDefault();

    let user_first_name = signup_form.querySelector("#first_name_input")?.value;
    let user_last_name = signup_form.querySelector("#last_name_input")?.value;
    let user_email = signup_form.querySelector("input[type='email']").value;
    let user_password = signup_form.querySelector("input[type='password']").value;

    payload = JSON.stringify({
        id: "",
        first_name: user_first_name,
        last_name: user_last_name,
        password: user_password,
        email: user_email    
    });

    try{
        const data = await fetch("/auth/login", {
            method: "POST",
            headers:{
                "Content-Type": "application/json"
            },
            body: payload
        });

        if(data.status !== 200){
            signup_error_output.textContent = data.error;
            return;
        }

        auth_code = data.code;

        signup_user_inputs.forEach(input => input.style.display = "none");

        auth_code_div.style.display = "flex";
        link_btn.style.display = "block";
        expiry_el.style.display = "block";

        confirm_btn.style.display = "block";
        signup_btn.style.display = "none";
    }
    catch(err){
        console.error(err);
    }
}

confirm_btn.addEventListener("click", async () => {
    let user_auth_code = Array.from(auth_inputs).map(i => i.value.trim()).join("");
    
    if(user_auth_code === auth_code.trim()){
        auth_inputs.forEach(input => input.value = "");

        try{
            const data = await fetch("/auth/complete", {
                method: "POST",
                headers:{
                    "Content-Type": "application/json"
                },
                body: payload
            });

            console.log("Account created", data);
        }
        catch(err){
            console.error(err);
        }
    }
});
