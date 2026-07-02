import { DropdownComponent, TextComponent, setIcon } from "obsidian";
import type { AreaFieldDef, FieldValue } from "../../types";

export function renderDetailSection(
	container: HTMLElement,
	title: string,
	icon?: string,
): HTMLElement {
	const section = container.createDiv("area-detail-section");
	const heading = section.createDiv("area-detail-section-title");
	if (icon) {
		const iconEl = heading.createSpan("area-detail-section-icon");
		setIcon(iconEl, icon);
		iconEl.setAttribute("aria-hidden", "true");
	}
	heading.createSpan({ text: title });
	return section;
}

export function renderTextField(
	container: HTMLElement,
	type: "text" | "url",
	value: string,
	onChange: (val: string) => void,
	label?: string,
	placeholder?: string,
): void {
	const wrap = label ? container.createDiv("area-detail-field") : container;
	if (label) wrap.createEl("label", { text: label });
	const input = new TextComponent(wrap).setValue(value).onChange(onChange);
	if (placeholder) input.setPlaceholder(placeholder);
	// Keep the theme-styled type="text": Obsidian's default input CSS enumerates
	// input types and omits `url`, so type="url" falls back to an unstyled
	// browser-default box (2px grey border, square corners, 22px tall) that
	// breaks parity with the Title/Tags fields. inputmode still hints the mobile
	// URL keyboard without changing the element type.
	if (type === "url") input.inputEl.inputMode = "url";
}

export function renderCustomFieldInput(
	container: HTMLElement,
	def: AreaFieldDef,
	current: FieldValue | undefined,
	onChange: (val: FieldValue | undefined) => void,
): void {
	if (def.type === "select" && def.options) {
		const select = new DropdownComponent(container);
		select.addOption("", "None");
		for (const opt of def.options) {
			select.addOption(opt, opt);
		}
		select
			.setValue(typeof current === "string" ? current : "")
			.onChange((value) => onChange(value || undefined));
		return;
	}

	if (def.type === "number") {
		const input = new TextComponent(container).setValue(
			current !== undefined ? String(current) : "",
		);
		input.inputEl.type = "number";
		input.onChange((value) => {
			if (value.trim() === "") {
				onChange(undefined);
				return;
			}

			const n = parseFloat(value);
			if (!isNaN(n)) onChange(n);
		});
		return;
	}

	renderTextField(
		container,
		def.type as "text" | "url",
		current !== undefined ? String(current) : "",
		(value) => onChange(value.trim() || undefined),
	);
}
