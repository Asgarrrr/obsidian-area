import { setIcon } from "obsidian";
import { stopEvent } from "../../dom";
import type { AreaFieldDef } from "../../types";
import { hasOption } from "./schemaUtils";

// Token-style editor for a select field's options: removable pills plus an
// input that adds on Enter/comma. Mutates def.options in place and calls onChanged.
export function renderSelectOptionsEditor(
	container: HTMLElement,
	def: AreaFieldDef,
	onChanged: () => void,
): void {
	container.empty();
	if (!def.options) def.options = [];
	const options = def.options;

	const wrap = container.createDiv("multi-select-container area-token-editor");
	// Attached once: rebuild() only swaps wrap's children, so a per-rebuild
	// listener would stack. Focus whichever input is currently mounted.
	wrap.addEventListener("click", () => {
		wrap.querySelector<HTMLInputElement>(".area-token-editor-input")?.focus();
	});

	const rebuild = () => {
		wrap.empty();
		for (const opt of options) {
			const pill = wrap.createDiv("multi-select-pill area-token-pill");
			pill.createDiv({ cls: "multi-select-pill-content", text: opt });

			const removeButton = pill.createDiv(
				"multi-select-pill-remove-button clickable-icon",
			);
			removeButton.setAttribute("aria-label", `Remove option ${opt}`);
			setIcon(removeButton, "x");
			removeButton.addEventListener("click", (evt) => {
				stopEvent(evt);
				def.options = options.filter((o) => o !== opt);
				onChanged();
				renderSelectOptionsEditor(container, def, onChanged);
			});
		}

		const inputWrap = wrap.createDiv("area-token-editor-input-container");
		const inputEl = inputWrap.createEl("input", {
			type: "text",
			cls: "area-token-editor-input",
		});
		inputEl.placeholder = "Add option...";
		inputEl.addEventListener("keydown", (e) => {
			if (e.key !== "Enter" && e.key !== ",") return;
			e.preventDefault();
			const val = inputEl.value.trim().replace(/,+$/, "");
			if (val && !hasOption(options, val)) {
				options.push(val);
				onChanged();
			}
			inputEl.value = "";
			rebuild();
		});
	};

	rebuild();
}
