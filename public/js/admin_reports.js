
const report_list = document.querySelector(".report-list");

report_list?.addEventListener("click", event => {
	const row = event.target.closest(".report-row");
	if(!row) return;

	if(event.target.closest(".mark-reviewed-btn")) return update_status(row, "reviewed");
	if(event.target.closest(".mark-dismissed-btn")) return update_status(row, "dismissed");
});

/**
 * Marks a report row reviewed or dismissed, updating the badge and removing
 * the action buttons in place on success.
 * @param {HTMLElement} row - The `.report-row` element.
 * @param {"reviewed"|"dismissed"} status - Target status.
 * @returns {Promise<void>}
 */
async function update_status(row, status){
	const report_id = row.dataset.reportId;

	try{
		const response = await fetch(`/admin/reports/${report_id}`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ status })
		});

		const result = await response.json().catch(() => ({}));

		if(!response.ok){
			const error = new Error(result.error || "Failed to update report.");
			error.status = response.status;
			error.details = result.error || "Failed to update report.";
			throw error;
		}

		row.dataset.status = status;

		const badge = row.querySelector(".report-status-badge");
		badge.textContent = status;
		badge.className = `report-status-badge status-${status}`;

		row.querySelector(".report-actions")?.remove();

		show_error(status === "reviewed" ? "Marked as reviewed" : "Report dismissed", "", "", false, false);
	}
	catch(err){
		const status_code = err.status || "500";
		const message = err.details || err.message || "Network error. Please try again.";

		show_error("Update Failed", status_code, message);
	}
}
