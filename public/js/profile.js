
//-- Accordion sections --//
const accordion_toggles = document.querySelectorAll("[data-accordion-toggle]");

accordion_toggles.forEach(header => {
	header.addEventListener("click", () => toggle_accordion_section(header));

	header.addEventListener("keydown", event => {
		if(event.key !== "Enter" && event.key !== " ") return;

		event.preventDefault();
		toggle_accordion_section(header);
	});
});

/**
 * Opens the given accordion section header and closes every other one.
 * Clicking the already-open header is a no-op (there is always exactly one open).
 * @param {HTMLElement} header - The `[data-accordion-toggle]` header that was activated.
 * @returns {void}
 */
function toggle_accordion_section(header){
	if(header.getAttribute("aria-expanded") === "true") return;

	accordion_toggles.forEach(other => {
		other.setAttribute("aria-expanded", other === header ? "true" : "false");
	});
}

/**
 * Copies the current page URL to the clipboard, falling back to a hidden-textarea copy
 * when the async Clipboard API is unavailable.
 * @returns {Promise<void>}
 */
async function copy_link(){
	const current_url = window.location.href;

	if(navigator.clipboard && window.isSecureContext){
		try{
			await navigator.clipboard.writeText(current_url);
			//is_serverside/is_error both false — this is a success, not a red HTTP error toast.
			show_error("Copied to clipboard", "", "", false, false);
			return;
		}
		catch(err){
			console.error("Clipboard API failed:", err);
		}
	}

	try{
		const text_area = document.createElement("textarea");
		text_area.value = current_url;

		//Prevent scrolling to bottom on mobile
		text_area.style.position = "fixed";
		text_area.style.left = "-9999px";

		document.body.appendChild(text_area);
		text_area.focus();
		text_area.select();

		const successful = document.execCommand("copy");
		document.body.removeChild(text_area);

		if(successful){
			show_error("Copied to clipboard", "", "", false, false);
		}
		else{
			show_error("Failed to copy link", "", "", false);
		}
	}
	catch(err){
		console.error("Fallback copy failed:", err);
		show_error("Failed to copy link", "", "", false);
	}
}