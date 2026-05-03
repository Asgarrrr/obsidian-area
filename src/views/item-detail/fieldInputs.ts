import { DropdownComponent, TextComponent } from "obsidian";
import type { AreaFieldDef, FieldValue } from "../../types";

export function renderDetailSection(
	container: HTMLElement,
	title: string,
): HTMLElement {
	const section = container.createDiv("area-detail-section");
	section.createDiv({ cls: "area-detail-section-title", text: title });
	return section;
}

export function renderTextField(
	container: HTMLElement,
	label: string,
	type: "text" | "url",
	value: string,
	onChange: (val: string) => void,
): void {
	const wrap = label ? container.createDiv("area-detail-field") : container;
	if (label) wrap.createEl("label", { text: label });
	const input = new TextComponent(wrap).setValue(value).onChange(onChange);
	input.inputEl.type = type;
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
		"",
		def.type as "text" | "url",
		current !== undefined ? String(current) : "",
		(value) => onChange(value.trim() || undefined),
	);
}
