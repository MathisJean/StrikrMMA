import { GET, POST, PUT, PATCH, DELETE} from "./http_requests.js";

function slugify(text){
    return text
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")                 // split accents from letters
        .replace(/[\u0300-\u036f]/g, "")  // remove accents
        .replace(/[^a-z0-9]+/g, "-")      // replace junk with hyphens
        .replace(/^-+|-+$/g, "");         // trim hyphens
}

window.addEventListener('DOMContentLoaded', () => {
    search_form.requestSubmit();
});

const search_form = document.querySelector('.search-container form');
const athletes =  document.querySelector('.athletes');
const pagination =  document.querySelector('.pagination');
const search_input = document.querySelector('.input-wrapper input[type="search"]');
const clear_btn = document.getElementById('clear-search');

clear_btn.addEventListener('click', () => {
    search_input.value = '';
    search_form.requestSubmit();
});

const MAX_CACHE_ENTRIES = 30;
const LIMIT = 50;
let cached_results = {};
let page = 1;
let debounce_timeout;

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
    clearTimeout(debounce_timeout);

    debounce_timeout = setTimeout(() => {
        search_form.requestSubmit();
    }, 300); //Wait 300ms after last keystroke
});

search_form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const form_data = new FormData(search_form);
    const search = form_data.get("search");
    let url;

    url = `/athletes?search=${search.replace(/ /g, "+")}&page=${page}&limit=${LIMIT}`
    
    if(cached_results[search] && cached_results[search][page] && cached_results[search][page][LIMIT]){
        render_users(cached_results[search][page][LIMIT]);
        history.pushState({ search }, '', url);
        return;
    }

    const data = await GET(`/api/athletes?search=${encodeURIComponent(search)}&page=${page}&limit=${LIMIT}`);        
    const users = data.users

    if(Object.keys(cached_results).length >= MAX_CACHE_ENTRIES){
        const oldest = Object.keys(cached_results).shift();
        delete cached_results[oldest];

        cached_results[search] ??= {};
        cached_results[search][page] ??= {};
        cached_results[search][page][LIMIT] = users;
    }
    else{
        cached_results[search] ??= {};
        cached_results[search][page] ??= {};
        cached_results[search][page][LIMIT] = users;
    }

    render_users(users, url, search)
});

function render_users(users, url, search){
    athletes.innerHTML = '';

    if(users.length <= 0){
        const p = document.createElement('p');
        p.id = "search-prompt";
        p.innerHTML = "User not found";

        athletes.append(p);
    }

    users.forEach((user, index) => {
        const a = document.createElement('a');
        a.classList.add("user");

        a.dataset.bg = `${user.profile_pic_url}`
        a.href = `/athletes/${user.first_name.toLowerCase()}_${user.last_name.toLowerCase()}_${user.id}`

        a.innerHTML = `
        <div class="user-info">
            <div class="user-name">                   
                ${user.first_name}
                ${user.nickname ? `"${user.nickname}"` : ""}
                ${user.last_name}
            </div>
            <div class="user-record">                   
                ${user.wins}W - ${user.losses}L - ${user.decisions}D
            </div>
        </div>
        `

        bg_observer.observe(a);
        athletes.appendChild(a);
        setTimeout(() => a.classList.add('show'), index * 50);
    })

    if(users.length > 0) change_page(users, url, search);
}

function change_page(users, url, search){
    pagination.innerHTML = '';

    const total_pages = Math.ceil(users[0].total_count / LIMIT);
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

    history.pushState({ search }, '', url);
}