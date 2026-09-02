const profile_form = document.getElementById("profile-form");
const profile_btn = document.getElementById("profile-btn");

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; //keep in sync with the multer limit in routes/api_router.js
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"];

//FilePond keeps a picked file at origin INPUT even after it has been saved, so ids of files
//already persisted are tracked here to stop the next save re-uploading the same image.
const saved_file_ids = new Set();

//Server-side group keys mapped to what a failure should read as in the toast.
const GROUP_LABELS = {
	profiles: "profile",
	records: "record",
	profile_weight_classes: "weight classes",
	profile_martial_arts: "martial arts",
	tags: "tags",
	awards: "awards",
	profile_picture_url: "profile picture",
	profile_banner_url: "banner"
};

document.addEventListener("DOMContentLoaded", () => {
	//Setup tag counters
	const tags = Array.from(document.querySelectorAll(".tag > .profile-input"));
	const counters = Array.from(document.querySelectorAll(".tag .suffix"));

	tags.forEach((tag, index) => {
		tag.addEventListener("input", () => { update_counter(tag, counters[index]) });
		update_counter(tag, counters[index]);
	});

	//This is the only place ponds are created — the settings view must not create its own,
	//or the same input ends up with two of them and only one carries these options.
	FilePond.registerPlugin(
		FilePondPluginFileValidateType,
		FilePondPluginImagePreview
	);

	//Initialize Image Inputs
	document.querySelectorAll(".drop-area").forEach(container => {
		const input = container.querySelector(".filepond");
		if(!input) return;

		const initial_url = container.dataset.initialImage;

		FilePond.create(input, {
			stylePanelLayout: "integrated",

			allowMultiple: false,
			storeAsFile: true,
			acceptedFileTypes: ACCEPTED_IMAGE_TYPES,
			maxFileSize: MAX_UPLOAD_BYTES,

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

				//Only a file the user actually picked, and hasn't already been saved, counts as
				//a new upload. The pre-loaded existing image is also a real File once FilePond
				//fetches it, so testing `instanceof File` re-uploaded it on every single save.
				if(file_item.origin === FilePond.FileOrigin.INPUT && !saved_file_ids.has(file_item.id)){
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
			show_error("No Changes Made", "", "", false, false);
			return;
		}

		changes.id = PROFILE_ID;

		form_data.append("json", JSON.stringify(changes));

		const response = await fetch("/api/update/profile", {
			method: "PATCH",
			body: form_data
		});

		const data = await response.json();

		if(response.ok){
			const media = data.media || {};

			if(media.profile_picture_url !== undefined && data.is_owner){
				profile_btn.style.backgroundImage = media.profile_picture_url
					? `url('${media.profile_picture_url}'), url('/svg/profile_light.svg')`
					: "url('/svg/profile_light.svg')";
			}

			const failed_groups = data.failed_groups || [];
			const failed_uploads = data.failed_uploads || [];

			//Everything that saved is the new baseline, so the next diff only reports what
			//actually changed after this point. `group` is a key, not the object it names —
			//iterating it directly walked the characters of the string instead of the fields.
			Object.keys(initial_state).forEach(group => {
				if(!current_state[group]) return;
				if(failed_groups.includes(group)) return;

				if(Array.isArray(current_state[group])){
					initial_state[group] = structuredClone(current_state[group]);
					return;
				}

				Object.keys(current_state[group]).forEach(key => {
					if(failed_uploads.includes(key)) return;

					initial_state[group][key] = current_state[group][key];
				});
			});

			//Media is stored as a URL but submitted as a filename, so the baseline takes the
			//URL the server actually saved. The pond still holds the picked file, so its id
			//is remembered too — otherwise the very next save would upload it a second time.
			Object.keys(media).forEach(field => {
				initial_state.profiles[field] = media[field] ?? "";

				const pond_input = document.querySelector(`[data-field="${field}"] .filepond`);
				const pond = pond_input ? FilePond.find(pond_input) : null;
				const file_item = pond?.getFiles()[0];

				if(file_item) saved_file_ids.add(file_item.id);
			});

			const failures = [...failed_uploads, ...failed_groups];
			const failure_list = failures
				.map(item => GROUP_LABELS[item] || item.replace(/_/g, " "))
				.join(", ")
				.toLowerCase()
				.replace(/, ([^,]*)$/, " and $1");

			if(failures.length > 0){
				show_error("Saved With Issues", "422", `Failed to save ${failure_list}`, true, true);
			}
			else{
				show_error("Saved Changes", "", "", false, false);
			}
		}
		else{
			const error = new Error(data.error || "Error Saving Data.");
			error.status = response.status;
			error.details = data.error || "Error Saving Data.";
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
