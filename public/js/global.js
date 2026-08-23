
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
window.addEventListener("DOMContentLoaded", async () => { //TODO:Clean Search Params on Refreash
    const user = await get_session();
    
    if(user){        
        if(profile_btn){
			join_btn.style.display = "none";

            profile_btn.style.display = "block";
            profile_btn.style.backgroundImage = `url('${user.profile_picture_url}'), url('/svg/profile.svg')`;

            profile_btn.addEventListener('click', () => {
                window.location.assign(`/u/${user.username.toLowerCase()}`);
            });
            
            setting_btn?.addEventListener('click', () => {
                window.location.assign(`/u/${user.username.toLowerCase()}/settings`);
            });
            
            logout_btn?.addEventListener('click', () => {
                logout();
            });
        }
    }
});

async function get_session(){
    try{
        const response = await fetch(`/api/session`);

        if(response.ok == false) throw new Error(response)

		const data = await response.json()

        return data;
    }
    catch(err){
        return null;
    }
}

async function logout(){
    await fetch("/api/logout", { method: 'post' });
    window.location.href = "/";
}

//-- Error Display --//
const error_dialog = document.getElementById("error-dialog");
const error_content = document.querySelector(".error-content");
const error_context = document.getElementById("error-context");
const error_message = document.getElementById("error-message");
const error_code = document.getElementById("error-code");
const error_text = document.getElementById("error-text");

window.show_error = function(err_context, err_code, err_text, is_serverside = true, is_error = true){
	const root_blue = getComputedStyle(document.documentElement).getPropertyValue('--blue').trim();
	const root_red = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();

	if(!error_dialog){
        console.warn("#error-dialog element not found on this page.");
        return;
    }

	if(is_serverside) error_message.style.display = "block";
	else error_message.style.display = "none";

	if(is_error) error_content.style.backgroundColor = root_red;
	else error_content.style.backgroundColor = root_blue;

	if(error_context) error_context.textContent = err_context;
    if(error_code) error_code.textContent = err_code;
    if(error_text) error_text.textContent = err_text;

	error_dialog.style.transform = "translateY(0%)";

	setTimeout(() => {
		error_dialog.style.transform = "translateY(100%)";
	}, 3000)
}

//-- Searchbar --//
const search_form = document.querySelector('.search-container form');
const search_menu =  document.querySelector('.search-menu');
const results =  document.querySelector('.results');
const pagination =  document.querySelector('.pagination');
const search_input = document.querySelector('.input-wrapper input[type="search"]');
const clear_btn = document.getElementById('search-clear');

const search_url = new URL(window.location.href);

const MAX_CACHE_ENTRIES = 30;
const LIMIT = 10;
let cached_results = {};
let page = 1;
let debounce_timeout;

//Show and hide results menu
search_input.addEventListener('focus', () => {
	if(search_input.value === '') pagination.style.opacity = 0;	
	else pagination.style.opacity = 1;	

    search_menu.classList.add('visible-results');

	search_form.requestSubmit();
});

search_input.addEventListener('blur', () => {
	pagination.style.opacity = 0;

    search_menu.classList.remove('visible-results');

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('search');
    currentUrl.searchParams.delete('page');
    currentUrl.searchParams.delete('limit');

    window.history.replaceState({}, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
});

search_menu.addEventListener('mousedown', (e) => {
    e.preventDefault();
});

clear_btn.addEventListener('click', () => {
    search_input.value = '';

	const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('search');
    currentUrl.searchParams.delete('page');
    currentUrl.searchParams.delete('limit');

	window.history.replaceState({}, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
});

const bg_observer = new IntersectionObserver(
    (entries, observer) => {
        entries.forEach(entry => {
            if(!entry.isIntersecting) return;

            const el = entry.target;
            const bg = el.dataset.bg;

            if(bg){
                el.style.backgroundImage = `url("${bg}")`;
                observer.unobserve(el);
            }
        });
    },
    {
        rootMargin: "200px", //preload before visible
        threshold: 0
    }
);

search_input.addEventListener('input', () => {
	if(search_input.value === '') pagination.style.opacity = 0;	
	else pagination.style.opacity = 1;	

    clearTimeout(debounce_timeout);

    debounce_timeout = setTimeout(() => {
        search_form.requestSubmit();
    }, 300); //Wait 300ms after last keystroke
});

search_form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const form_data = new FormData(search_form);
    let search = form_data.get("search");
	search = search === "" ? "*" : search;

	const params = new URLSearchParams({
		search: search,
		page: page,
		limit: LIMIT
	});

	const current_path = window.location.pathname;
	const base_hash = (window.location.hash).split('?')[0];

    const url = `${current_path}${base_hash}?${params.toString()}`;
    
    if(cached_results[search] && cached_results[search][page] && cached_results[search][page][LIMIT]){
        render_users(cached_results[search][page][LIMIT]);
        history.pushState({ search }, '', url);
        return;
    }
	
    const result = await fetch(`/api/athletes?search=${encodeURIComponent(search)}&page=${page}&limit=${LIMIT}`);        
    const data = await result.json();
	const profiles = data.athletes;

    if(Object.keys(cached_results).length >= MAX_CACHE_ENTRIES){
        const oldest = Object.keys(cached_results).shift();
        delete cached_results[oldest];

        cached_results[search] ??= {};
        cached_results[search][page] ??= {};
        cached_results[search][page][LIMIT] = profiles;
    }
    else{
        cached_results[search] ??= {};
        cached_results[search][page] ??= {};
        cached_results[search][page][LIMIT] = profiles;
    }

    render_users(profiles, url, search)
});

function render_users(profiles, url, search){
    results.innerHTML = '';

    if(profiles.length <= 0){
        const p = document.createElement('p');
        p.id = "search-prompt";
        p.innerHTML = "Profile not found";

        results.append(p);

		return;
    }

    profiles.forEach((profile, index) => {
        const a = document.createElement('a');
        a.classList.add("user");

        if(profile.profile_picture_url) a.dataset.bg = `${profile.profile_picture_url}`;
		else a.dataset.bg = `/svg/profile.svg`;
        a.href = `/u/${profile.username}`

        a.innerHTML = `
        <div class="user-info">
            <div class="user-name">                   
                ${profile.first_name}
                ${profile.nickname ? `"${profile.nickname}"` : ""}
                ${profile.last_name}
            </div>
            <div class="user-record">                   
                ${profile.wins == null ? 0 : profile.wins }W - ${profile.losses == null ? 0 : profile.losses}L - ${profile.decisions == null ? 0 : profile.decisions}D - ${profile.no_contest == null ? 0 : profile.no_contest}D
            </div>
        </div>
        `

        bg_observer.observe(a);
        results.appendChild(a);
        setTimeout(() => a.classList.add('show'), index * 50);
    })

    if(profiles.length > 0) change_page(profiles, url, search);
}

function change_page(profiles, url, search){
    pagination.innerHTML = '';

    const total_pages = Math.ceil(profiles[0].total_count / LIMIT);
    const pages = [];

    //If pages are less or equal then 7
    if(total_pages <= 7){
        for (let i = 1; i <= total_pages; i++) pages.push(i);
    }
    else{
        pages.push(1);
        
        if(page > 4 && page < total_pages - 3){
            pages.push("...")
            pages.push(page - 1);
            pages.push(page);
            pages.push(page + 1);
            pages.push("...")
        }
        else{
            if(page > 4){
                pages.push("...")
            }
            else{
                pages.push(2);
                pages.push(3);
                pages.push(4);
                pages.push(5);
            }
            
            if(page < total_pages - 3){
                pages.push("...")
            }
            else{
                pages.push(total_pages - 4)
                pages.push(total_pages - 3)
                pages.push(total_pages - 2)
                pages.push(total_pages - 1)
            }
        }
        
        pages.push(total_pages)
    }

    pages.forEach(i => {
        if(i === "..."){
            const dots = document.createElement('span');
            dots.innerText = "...";
    
            pagination.appendChild(dots);
        }
        else{
            const p = document.createElement('p');
            p.classList.add('page-input');
            p.dataset.page = i;
            p.innerText = i;
    
            if(i === page) p.classList.add('active');
    
            p.addEventListener('click', () => {
                page = i;
    
                search_form.requestSubmit();
            })
    
            pagination.appendChild(p);
        }
    });

    history.pushState({ search, page }, '', url);
}