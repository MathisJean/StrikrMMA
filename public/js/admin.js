
const create_form = document.getElementById("create-form");
const placeholder_list = document.querySelector(".placeholder-list");

const delete_dialog = document.getElementById("delete-placeholder-dialog");
const cancel_delete_btn = document.getElementById("cancel-delete-placeholder-btn");
const confirm_delete_btn = document.getElementById("confirm-delete-placeholder-btn");

let pending_delete_row = null;

create_form?.addEventListener("submit", event => create_placeholder(event));

/**
 * Submits the create-placeholder form and reloads the dashboard on success.
 * @param {SubmitEvent} event - The form submit event.
 * @returns {Promise<void>}
 */
async function create_placeholder(event){
	event.preventDefault();

	const first_name = document.getElementById("create-first-name")?.value.trim() || "";
	const last_name = document.getElementById("create-last-name")?.value.trim() || "";
	const badge = create_form.querySelector("input[name='badge']:checked")?.value || "none";

	if(!first_name || !last_name){
		show_error("Create Failed", "400", "First and last name are required");
		return;
	}

	try{
		const response = await fetch("/admin/profiles", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ first_name, last_name, badge })
		});

		const result = await response.json().catch(() => ({}));

		if(!response.ok){
			const error = new Error(result.error || "Create failed.");
			error.status = response.status;
			error.details = result.error || "Create failed.";
			throw error;
		}

		window.location.reload();
	}
	catch(err){
		const status_code = err.status || "500";
		const message = err.details || err.message || "Network error. Please try again.";

		show_error("Create Failed", status_code, message);
	}
}

placeholder_list?.addEventListener("click", event => {
	const row = event.target.closest(".placeholder-row");
	if(!row) return;

	if(event.target.closest(".generate-link-btn")) return generate_claim_link(row);
	if(event.target.closest(".copy-link-btn")) return copy_claim_link(row);
	if(event.target.closest(".delete-btn")) return open_delete_dialog(row);
});

/**
 * Generates a claim link for a placeholder row and reveals it for copying.
 * @param {HTMLElement} row - The `.placeholder-row` element.
 * @returns {Promise<void>}
 */
async function generate_claim_link(row){
	const user_id = row.dataset.userId;

	try{
		const response = await fetch(`/admin/profiles/${user_id}/claim-link`, { method: "POST" });

		const result = await response.json().catch(() => ({}));

		if(!response.ok){
			if(response.status === 409){
				window.location.reload();
				return;
			}

			const error = new Error(result.error || "Failed to generate link.");
			error.status = response.status;
			error.details = result.error || "Failed to generate link.";
			throw error;
		}

		const output = row.querySelector(".claim-link-output");
		const field = row.querySelector(".claim-link-field");

		field.value = result.claim_url;
		output.hidden = false;
	}
	catch(err){
		const status_code = err.status || "500";
		const message = err.details || err.message || "Network error. Please try again.";

		show_error("Link Generation Failed", status_code, message);
	}
}

/**
 * Copies a placeholder row's claim link to the clipboard, falling back to a
 * hidden-textarea copy when the async Clipboard API is unavailable.
 * @param {HTMLElement} row - The `.placeholder-row` element.
 * @returns {Promise<void>}
 */
async function copy_claim_link(row){
	const field = row.querySelector(".claim-link-field");
	const link = field?.value || "";

	if(!link) return;

	if(navigator.clipboard && window.isSecureContext){
		try{
			await navigator.clipboard.writeText(link);
			show_error("Copied to clipboard", "", "", false, false);
			return;
		}
		catch(err){
			console.error("Clipboard API failed:", err);
		}
	}

	try{
		field.select();
		const success = document.execCommand("copy");

		if(success) show_error("Copied to clipboard", "", "", false, false);
		else show_error("Failed to copy link", "", "", false);
	}
	catch(err){
		console.error("Fallback copy failed:", err);
		show_error("Failed to copy link", "", "", false);
	}
}

/**
 * Opens the shared delete-confirmation dialog for a given placeholder row.
 * @param {HTMLElement} row - The `.placeholder-row` element.
 * @returns {void}
 */
function open_delete_dialog(row){
	pending_delete_row = row;
	delete_dialog.showModal();
}

cancel_delete_btn?.addEventListener("click", () => {
	pending_delete_row = null;
	delete_dialog.close();
});

confirm_delete_btn?.addEventListener("click", async() => {
	if(!pending_delete_row) return;

	const user_id = pending_delete_row.dataset.userId;
	const row = pending_delete_row;

	try{
		const response = await fetch(`/admin/profiles/${user_id}`, { method: "DELETE" });

		if(!response.ok){
			const result = await response.json().catch(() => ({}));
			const error = new Error(result.error || "Failed to delete placeholder.");
			error.status = response.status;
			throw error;
		}

		row.remove();
	}
	catch(err){
		const status_code = err.status || "500";
		show_error("Delete Failed", status_code, err.message || "Please try again");
	}
	finally{
		pending_delete_row = null;
		delete_dialog.close();
	}
});
