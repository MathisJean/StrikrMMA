
//Shared slider for the onboarding and claim flows: the retired login/signup swap, generalised to N steps.

/**
 * Wires a `.step-track` up as an N-step slider. Advancing is gated on `on_leave`: returning
 * false blocks the move, so a step's required fields are enforced rather than decorative.
 * @param {HTMLElement} track - The `.step-track` element holding `.step-panel` children.
 * @param {object} [options]
 * @param {(from_step: number, to_step: number) => boolean} [options.on_leave] - Called before leaving a step; return false to block the move.
 * @param {(step: number) => void} [options.on_enter] - Called after a step becomes active.
 * @returns {{ go_to: (step: number) => boolean, next: () => boolean, back: () => boolean, current: () => number }}
 */
export function init_steps(track, { on_leave, on_enter } = {}){
	const viewport = track.closest(".step-viewport");
	const panels = Array.from(track.querySelectorAll(".step-panel"));
	const indicators = document.querySelectorAll("[data-step-indicator]");

	let current_step = 1;

	/**
	 * Sizes the viewport to the active panel. Every panel stays in flow so the track keeps a
	 * consistent width, which means without this the viewport would always be as tall as the
	 * longest step.
	 * @returns {void}
	 */
	function resize_viewport(){
		const active = panels[current_step - 1];

		if(viewport && active) viewport.style.height = `${active.offsetHeight}px`;
	}

	/**
	 * Moves to a step, refusing anything out of range or blocked by `on_leave`.
	 * @param {number} step - 1-based step number.
	 * @returns {boolean} Whether the move happened.
	 */
	function go_to(step){
		if(step < 1 || step > panels.length) return false;

		if(step !== current_step && on_leave && on_leave(current_step, step) === false) return false;

		current_step = step;

		track.style.transform = `translateX(${(step - 1) * -100}%)`;

		panels.forEach((panel, index) => {
			const is_active = index === step - 1;

			panel.classList.toggle("step-active", is_active);
			//Hidden panels stay in the layout, so they leave the tab order and a11y tree explicitly.
			panel.inert = !is_active;
			panel.setAttribute("aria-hidden", String(!is_active));
		});

		indicators.forEach(indicator => {
			indicator.textContent = `STEP ${step} OF ${panels.length}`;
		});

		resize_viewport();

		//Focus the first control so keyboard and screen-reader users land inside the new step.
		panels[step - 1]?.querySelector("input, select, textarea, button")?.focus({ preventScroll: true });

		on_enter?.(step);

		return true;
	}

	track.querySelectorAll("[data-target-step]").forEach(button => {
		button.addEventListener("click", () => go_to(Number(button.dataset.targetStep)));
	});

	//Panel height changes as messages appear, and the viewport is fixed px, so re-measure.
	if(window.ResizeObserver){
		const observer = new ResizeObserver(() => resize_viewport());
		panels.forEach(panel => observer.observe(panel));
	}

	window.addEventListener("resize", resize_viewport);

	go_to(1);

	return {
		go_to,
		next: () => go_to(current_step + 1),
		back: () => go_to(current_step - 1),
		current: () => current_step
	};
}
