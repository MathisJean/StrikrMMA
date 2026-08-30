//-- URL Manipulation --//
if(window.location.hash === '#login' || window.location.hash === '#signup'){
	//Strips the hash from the URL bar without causing a page reload
	history.replaceState(null, document.title, window.location.pathname + window.location.search);
}	

window.addEventListener("DOMContentLoaded", async() => {
	//Clean Search Parameters on Refresh
	const current_url = new URL(window.location.href);

	current_url.searchParams.delete("search");
	current_url.searchParams.delete("page");
	current_url.searchParams.delete("limit");

	window.history.replaceState({}, "", current_url.pathname + current_url.search + current_url.hash);
});

//-- Dynamic viewport height --//
//In-app browsers (Instagram/TikTok webviews) resize their own chrome, so
//visualViewport is tracked as the primary height source, not dvh alone.
/**
 * Measures the real visible viewport height and exposes it as --app-height.
 * @returns {void}
 */
function set_app_height(){
	const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;

	document.documentElement.style.setProperty("--app-height", `${height}px`);
}

set_app_height();

window.addEventListener("resize", set_app_height);
window.addEventListener("orientationchange", set_app_height);

if(window.visualViewport){
	window.visualViewport.addEventListener("resize", set_app_height);
	window.visualViewport.addEventListener("scroll", set_app_height);
}

//Copy text content inside of before element
const gradient_txt = document.querySelectorAll(".gradient-txt");

Array.from(gradient_txt).forEach(element => {
	element.dataset.text = element.textContent;
});

//No text in number inputs
document.querySelectorAll('input[type="number"]').forEach(input => {
	input.addEventListener("input", () => {
		input.value = input.value.replace(/[^0-9]/g, "");
	});
});

//-- Variables --//
const profile_btn = document.getElementById("profile-btn");
const join_btn = document.getElementById("join-btn");
const setting_btn = document.getElementById("setting-btn");
const logout_btn = document.getElementById("logout-btn");

/**
 * Logs the current user out and redirects to the homepage.
 * @returns {Promise<void>}
 */
async function logout(){
	try{
		const response = await fetch("/api/logout", { method: "POST" });

		if(!response.ok){
			const error = new Error(response.message || "Logout Failed");
			error.status = response.status;
			error.details = response.error || response.message || "Please Try Again";
			throw error;
		}

		window.location.href = "/";
	}
	catch(err){
		const status_code = err.status || "500";
		const message = err.details || err.message || "Please Try Again";

		show_error("Logout Failed", status_code, message);
	}
}

logout_btn?.addEventListener("click", () => {
	logout();
});

//-- Error Display --//
const error_dialog = document.getElementById("error-dialog");
const error_content = document.querySelector(".error-content");
const error_context = document.getElementById("error-context");
const error_message = document.getElementById("error-message");
const error_code = document.getElementById("error-code");
const error_text = document.getElementById("error-text");

/**
 * Displays the global error/status toast.
 * @param {string} err_context - Heading text describing what failed.
 * @param {string} err_code - HTTP status code (or blank) to display.
 * @param {string} err_text - Error detail text to display.
 * @param {boolean} [is_serverside=true] - Whether to show the HTTP status/detail line.
 * @param {boolean} [is_error=true] - Whether to style the toast as an error (red) or info (blue).
 * @returns {void}
 */
window.show_error = function(err_context, err_code, err_text, is_serverside = true, is_error = true){
	const root_blue = getComputedStyle(document.documentElement).getPropertyValue("--blue").trim();
	const root_red = getComputedStyle(document.documentElement).getPropertyValue("--red").trim();

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
const search_form = document.querySelector(".search-container form");
const search_menu = document.querySelector(".search-menu");
const results = document.querySelector(".results");
const pagination = document.querySelector(".pagination");
const search_input = document.querySelector('.nav-input-wrapper input[type="search"]');
const clear_btn = document.getElementById("search-clear");

const search_url = new URL(window.location.href);

const MAX_CACHE_ENTRIES = 30;
let cached_results = {};
let page = 1;
let debounce_timeout;

/**
 * Returns how many search results to request per page for the current viewport.
 * Mobile/tablet fetch fewer results than desktop, matching the smaller results list.
 * @returns {number} The result limit to use for the next request.
 */
function get_search_limit(){
	return window.matchMedia("(min-width: 1024px)").matches ? 10 : 6;
}

//TODO: Fix
function hide_pagination(hiding = true){
	if(hiding){
		pagination.style.opacity = 0;
		pagination.style.pointerEvents = "none";
	}
	else{
		pagination.style.opacity = 1;
		pagination.style.pointerEvents = "all";
	}
}

//Show and hide results menu
search_input.addEventListener("focus", () => {
	console.log("test")

	if(search_input.value === "") hide_pagination();
	else hide_pagination(false);

	search_menu.classList.add("visible-results");

	search_form.requestSubmit();
});

search_input.addEventListener("blur", () => {
	hide_pagination();

	close_mobile_search();

	const current_url = new URL(window.location.href);
	current_url.searchParams.delete("search");
	current_url.searchParams.delete("page");
	current_url.searchParams.delete("limit");

	window.history.replaceState({}, "", current_url.pathname + current_url.search + current_url.hash);
});

search_menu.addEventListener("mousedown", (e) => {
	e.preventDefault();
});

clear_btn.addEventListener("click", () => {
	search_input.value = "";

	close_mobile_search();

	const current_url = new URL(window.location.href);
	current_url.searchParams.delete("search");
	current_url.searchParams.delete("page");
	current_url.searchParams.delete("limit");

	window.history.replaceState({}, "", current_url.pathname + current_url.search + current_url.hash);
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

search_input.addEventListener("input", () => {
	if(search_input.value === "") hide_pagination();
	else hide_pagination(false);

	clearTimeout(debounce_timeout);

	debounce_timeout = setTimeout(() => {
		search_form.requestSubmit();
	}, 300); //Wait 300ms after last keystroke
});

search_form.addEventListener("submit", async(event) => {
	event.preventDefault();

	const limit = get_search_limit();

	const form_data = new FormData(search_form);
	let search = form_data.get("search");
	search = search === "" ? "*" : search;

	const params = new URLSearchParams({
		search: search,
		page: page,
		limit: limit
	});

	const current_path = window.location.pathname;
	const base_hash = (window.location.hash).split("?")[0];

	const url = `${current_path}${base_hash}?${params.toString()}`;

	if(cached_results[search] && cached_results[search][page] && cached_results[search][page][limit]){
		render_users(cached_results[search][page][limit]);
		history.pushState({ search }, "", url);
		return;
	}

	const result = await fetch(`/api/athletes?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`);
	const data = await result.json();
	const profiles = data.athletes;

	if(Object.keys(cached_results).length >= MAX_CACHE_ENTRIES){
		const oldest = Object.keys(cached_results).shift();
		delete cached_results[oldest];

		cached_results[search] ??= {};
		cached_results[search][page] ??= {};
		cached_results[search][page][limit] = profiles;
	}
	else{
		cached_results[search] ??= {};
		cached_results[search][page] ??= {};
		cached_results[search][page][limit] = profiles;
	}

	render_users(profiles, url, search)
});

/**
 * Renders a page of athlete search results into the results grid.
 * @param {object[]} profiles - Athlete rows to render.
 * @param {string} [url] - URL to push into browser history for this result set.
 * @param {string} [search] - Search term associated with this result set.
 * @returns {void}
 */
function render_users(profiles, url, search){
	results.innerHTML = "";

	if(profiles.length <= 0){
		const p = document.createElement("p");
		p.id = "search-prompt";
		p.innerHTML = "Profile not Found";

		pagination.innerHTML = "";

		results.append(p);

		return;
	}

	profiles.forEach((profile, index) => {
		const a = document.createElement("a");
		a.classList.add("user");
		a.href = `/u/${profile.username}`

		a.innerHTML = `
		<div class="user-thumb"></div>
		<div class="user-info">
			<div class="user-name">
				${profile.first_name}
				${profile.nickname ? `"${profile.nickname}"` : ""}
				${profile.last_name}
			</div>
			<div class="user-record">
				${profile.wins == null ? 0 : profile.wins}W - ${profile.losses == null ? 0 : profile.losses}L - ${profile.decisions == null ? 0 : profile.decisions}D - ${profile.no_contest == null ? 0 : profile.no_contest}NC
			</div>
		</div>
		`

		const thumb = a.querySelector(".user-thumb");
		thumb.dataset.bg = profile.profile_picture_url ? `${profile.profile_picture_url}` : "/svg/profile_dark.svg";

		bg_observer.observe(thumb);
		results.appendChild(a);
		setTimeout(() => a.classList.add("show"), index * 50);
	})

	if(profiles.length > 0) change_page(profiles, url, search);
}

/**
 * Builds and renders the pagination controls for the current search result set.
 * @param {object[]} profiles - Current page of athlete rows (used to read `total_count`).
 * @param {string} url - URL to push into browser history when a page is selected.
 * @param {string} search - Search term associated with this result set.
 * @returns {void}
 */
function change_page(profiles, url, search){
	pagination.innerHTML = "";

	const total_pages = Math.ceil(profiles[0].total_count / get_search_limit());
	const pages = [];

	//If pages are less or equal then 7
	if(total_pages <= 7){
		for(let i = 1; i <= total_pages; i++) pages.push(i);
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
			const dots = document.createElement("span");
			dots.innerText = "...";

			pagination.appendChild(dots);
		}
		else{
			const p = document.createElement("p");
			p.classList.add("page-input");
			p.dataset.page = i;
			p.innerText = i;

			if(i === page) p.classList.add("active");

			p.addEventListener("click", () => {
				page = i;

				search_form.requestSubmit();
			})

			pagination.appendChild(p);
		}
	});

	history.pushState({ search, page }, "", url);
}

//-- Mobile Search --//
const mobile_search_btn = document.getElementById("mobile-search-btn");
const navbar_middle = document.querySelector(".navbar-middle");
const search_backdrop = document.querySelector("[data-search-backdrop]");

/**
 * Opens the mobile search overlay/dropdown and focuses the search input.
 * @returns {void}
 */
function open_mobile_search(){
	navbar_middle.classList.add("mobile-search-active");
	search_menu.classList.add("visible-results");
	search_backdrop.classList.add("visible");
	search_input.focus();
}

/**
 * Closes the mobile search overlay/dropdown and its backdrop.
 * @returns {void}
 */
function close_mobile_search(){
	search_menu.classList.remove("visible-results");
	navbar_middle?.classList.remove("mobile-search-active");
	search_backdrop?.classList.remove("visible");
}

mobile_search_btn?.addEventListener("click", open_mobile_search);
search_backdrop?.addEventListener("click", close_mobile_search);
