const profile_form = document.getElementById("profile-form");
const profile_btn = document.getElementById("profile-btn");

document.addEventListener("DOMContentLoaded", () => {
	//Setup tag counters
	const tags = Array.from(document.querySelectorAll(".tag > .profile-input"));
	const counters = Array.from(document.querySelectorAll(".tag .suffix"));

	tags.forEach((tag, index) => {
		tag.addEventListener("input", () => { update_counter(tag, counters[index]) });
		update_counter(tag, counters[index]);
	});

	//Initialize Image Inputs
	document.querySelectorAll(".drop-area").forEach(container => {
		const input = container.querySelector(".filepond");
		if(!input) return;

		const initial_url = container.dataset.initialimage;

		FilePond.create(input, {
			stylePanelLayout: "integrated",

			files: initial_url ? [
				{
					source: initial_url,
					options: {
						type: "local"
					}
				}
			] : [],
			server: {
				//Teach FilePond how to fetch local file URLs directly via fetch API
				load: (source, load, error, progress, abort, headers) => {
					fetch(source)
						.then(res => res.blob())
						.then(load)
						.catch(error);
				}
			}
		});
	});
});

/**
 * Updates a tag input's "X / max" character counter.
 * @param {HTMLInputElement} tag - The tag input element.
 * @param {HTMLElement} counter - The element displaying the counter text.
 * @returns {void}
 */
function update_counter(tag, counter){
	counter.textContent = `${tag.value.length} / ${tag.maxLength}`;
}

/**
 * Computes a minimal diff between two states, recursing into nested objects and arrays.
 * @param {*} initial - The original state.
 * @param {*} current - The current state.
 * @returns {*} The changed subset of `current`, or undefined if nothing changed.
 */
function get_difference(initial, current){
	//Primitive values
	if(typeof initial !== "object" || initial === null || typeof current !== "object" || current === null){
		return String(initial ?? "") !== String(current ?? "") ? current : undefined;
	}

	//Arrays
	if(Array.isArray(current)){
		const initial_array = Array.isArray(initial) ? initial : [];

		//Check if the current array consists of objects
		const is_object_array = current.length > 0 && current.every(
			item => typeof item === "object" && item !== null && !Array.isArray(item)
		);

		if(is_object_array){
			if(current.length !== initial_array.length){
				return current;
			}

			for(let i = 0; i < current.length; i++){
				const item_diff = get_difference(initial_array[i], current[i]);
				if(item_diff !== undefined){
					return current;
				}
			}

			return undefined;
		}

		//For primitive arrays, compare JSON strings directly
		return JSON.stringify(initial_array) !== JSON.stringify(current) ? current : undefined;
	}

	//Objects
	const diff = {};
	let has_changes = false;

	for(const key of Object.keys(current)){
		const val1 = initial ? initial[key] : undefined;
		const val2 = current[key];

		if(typeof val2 === "object" && val2 !== null){
			const nested_diff = get_difference(val1, val2);
			if(nested_diff !== undefined){
				diff[key] = nested_diff;
				has_changes = true;
			}
		}
		else if(String(val1 ?? "") !== String(val2 ?? "")){
			diff[key] = val2;
			has_changes = true;

			if(key === "height_feet" || key === "height_inches"){
				if("height_feet" in current) diff.height_feet = current.height_feet;
				if("height_inches" in current) diff.height_inches = current.height_inches;
			}
		}
	}

	return has_changes ? diff : undefined;
}

/**
 * Reads all `[data-group]` fields on the settings form into a grouped payload,
 * pulling any file inputs into a parallel FormData for upload.
 * @returns {{ payload: object, form_data: FormData }}
 */
function get_form_data(){
	const payload = {};
	const form_data = new FormData();

	document.querySelectorAll("[data-group]").forEach(input => {
		const { group, field, index } = input.dataset;

		if(group === "profile_weight_classes"){
			if(!payload[group]) payload[group] = [];
			if(!payload[group][index]) payload[group][index] = {};

			const raw_val = input.value;
			if(raw_val && raw_val.includes("-")){
				const [name, gender] = raw_val.split("-");
				payload[group][index] = { name, gender };
			}
			else{
				payload[group][index] = { name: "", gender: "" };
			}

			return;
		}

		const file_input = input.querySelector(".filepond");

		if(file_input){
			const pond = FilePond.find(file_input);
			if(!payload[group]) payload[group] = {};

			if(pond && pond.getFiles().length > 0){
				const file_item = pond.getFiles()[0];

				if(file_item.origin === FilePond.FileOrigin.INPUT || file_item.file instanceof File){
					form_data.append(field, file_item.file);
					payload[group][field] = file_item.file.name;
				}
				else{
					payload[group][field] = initial_state[group]?.[field] || null;
				}
			}
			else{
				payload[group][field] = null;
			}

			return;
		}

		const raw_value = input.value;

		if(index !== undefined){
			if(!payload[group]) payload[group] = [];
			if(!payload[group][index]) payload[group][index] = {};

			payload[group][index][field] = raw_value;
		}
		else{
			if(!payload[group]) payload[group] = {};
			payload[group][field] = raw_value;
		}
	});

	//Clean empty elements out of array groups
	Object.keys(payload).forEach(key => {
		if(Array.isArray(payload[key])){
			payload[key] = payload[key].filter(item =>
				item && Object.values(item).some(val => val !== null && String(val).trim() !== "")
			);
		}
	});

	return { payload, form_data };
}

profile_form.addEventListener("submit", async(event) => {
	event.preventDefault();

	try{
		const { payload: current_state, form_data: form_data } = get_form_data();

		const changes = get_difference(initial_state, current_state);

		if(changes === undefined){
			show_error("No Changed Made", "", "", false, false);
			return;
		}

		changes.id = USER_ID;

		form_data.append("json", JSON.stringify(changes));

		const response = await fetch("/api/update/profile", {
			method: "PATCH",
			body: form_data
		});

		const data = await response.json();

		if(response.ok){
			if(data.profile_picture_url !== undefined && data.is_owner) profile_btn.style.backgroundImage = `url('${data.profile_picture_url}'), url('/svg/profile_light.svg')`;

			initial_state = current_state;

			show_error("Saved Changed", "", "", false, false);
		}
		else{
			const error = new Error(result.message || "Error Saving Data.");
			error.status = response.status;
			error.details = result.error || result.message || "Error Saving Data.";
			throw error;
		}
	}
	catch(err){
		const status_code = err.status || "500";
		const message = err.details || err.message || "Error Saving Data.";

		show_error("Failed to Save Changes", status_code, message);
	}
});

//-- Delete Account --//
const delete_account_btn = document.getElementById("delete-account-btn");
const delete_account_dialog = document.getElementById("delete-account-dialog");
const cancel_delete_btn = document.getElementById("cancel-delete-btn");
const confirm_delete_btn = document.getElementById("confirm-delete-btn");

delete_account_btn?.addEventListener("click", () => {
	delete_account_dialog.showModal();
});

cancel_delete_btn?.addEventListener("click", () => {
	delete_account_dialog.close();
});

confirm_delete_btn?.addEventListener("click", async() => {
	try{
		const response = await fetch("/api/delete-account", { method: "DELETE" });

		if(!response.ok){
			const result = await response.json();
			const error = new Error(result.error || "Error Deleting Account.");
			error.status = response.status;
			throw error;
		}

		window.location.href = "/";
	}
	catch(err){
		delete_account_dialog.close();

		const status_code = err.status || "500";
		show_error("Failed to Delete Account", status_code, err.message);
	}
});
