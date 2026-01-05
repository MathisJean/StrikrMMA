import { GET, POST, PUT, PATCH, DELETE} from "./http_requests.js";

//Copy text content inside of before element
const gradient_txt = document.querySelectorAll('.gradient-txt');

Array.from(gradient_txt).forEach(element => {
    element.dataset.text = element.textContent; 
});

//No text in number inputs
document.querySelectorAll('input[type="number"]').forEach(input => {
    input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '');
    });
});

const profile_btn = document.getElementById("profile_btn");
const join_btn = document.getElementById("join_btn");
const setting_btn = document.getElementById("setting_btn");
const logout_btn = document.getElementById("logout_btn");

// Example usage
window.addEventListener("DOMContentLoaded", async () => {
    const user = await get_session();
    
    if(user){        
        if(profile_btn){
            profile_btn.style.display = "block";
            profile_btn.style.backgroundImage = `url('${user.profile_pic_url}'), url('/svg/account_icon.svg')`;
            
            profile_btn.addEventListener('click', () => {
                window.location.assign(`/athletes/${user.first_name.toLowerCase()}_${user.last_name.toLowerCase()}_${user.id}`);
            });
            
            setting_btn?.addEventListener('click', () => {
                window.location.assign(`/athletes/${user.first_name.toLowerCase()}_${user.last_name.toLowerCase()}_${user.id}/settings`);
            });
            
            logout_btn?.addEventListener('click', () => {
                logout();
            });

            join_btn.style.display = "none";
        }
    }
});

async function get_session(){
    try{
        const data = await GET(`/api/session`);

        if(data.ok == false) throw new Error(data)

        return data;
    }
    catch(err){
        return null;
    }
}

async function logout(){
    await POST("/api/logout");
    window.location.href = "/";
}