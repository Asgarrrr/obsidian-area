import { DropdownComponent, setIcon, TextComponent } from "obsidian";
import type { FieldType } from "../types";
import type { PatchAction, ValueSummary } from "./area-gallery/bulkEdit";

interface BulkFieldRowOptions {
	container: HTMLElement;
	label: string;
	type: FieldType;
	options?: string[]; // select only
	summary: ValueSummary;
	/** entry undefined = untouched. valid=false blocks Apply. */
	onChange: (entry: PatchAction | undefined, valid: boolean) => void;
}

// One row per single-value field (source URL + each schema field). Three
// states: untouched (default), set, cleared. Emptying a prefilled input means
// CLEAR, not untouched — bulk editors trained users to read deletion as
// "clear everywhere"; a silent no-op there is a data-integrity trap.
export function renderBulkFieldRow(options: BulkFieldRowOptions): void {
	const { container, label, type, summary, onChange } = options;

	const row = container.createDiv("area-bulk-field");
	const head = row.createDiv("area-bulk-field-head");
	head.createEl("label", { text: label });
	const chip = head.createSpan("area-bulk-field-chip");
	const revert = head.createDiv("area-bulk-field-revert clickable-icon");
	revert.setAttribute("aria-label", "Revert — leave untouched");
	setIcon(revert, "rotate-ccw");

	const original = summary.state === "common" ? String(summary.value) : "";

	const setRowState = (
		entry: PatchAction | undefined,
		valid: boolean,
		chipText: string,
	): void => {
		chip.setText(chipText);
		chip.toggleClass("area-bulk-field-chip--clear", chipText === "Will clear");
		chip.toggleClass("area-bulk-field-chip--error", !valid);
		// An invalid row also emits no entry, but it is dirty: hiding revert there
		// would strand the row with no way back to untouched.
		revert.toggleClass(
			"area-bulk-field-revert--hidden",
			entry === undefined && valid,
		);
		onChange(entry, valid);
	};

	const idleChip = (): string => (summary.state === "mixed" ? "Mixed" : "");

	if (type === "select") {
		const select = new DropdownComponent(row);
		select.addOption("", "(keep)");
		const selectOptions = options.options ?? [];
		const known = new Set(selectOptions);
		for (const opt of selectOptions) select.addOption(opt, opt);

		// A stored value the schema no longer offers must still display —
		// otherwise the select shows "(keep)" and misreports the state.
		if (
			summary.state === "common" &&
			typeof summary.value === "string" &&
			!known.has(summary.value)
		) {
			select.addOption(summary.value, `${summary.value} (removed from schema)`);
			select.selectEl
				.querySelector(`option[value="${CSS.escape(summary.value)}"]`)
				?.setAttribute("disabled", "true");
		}

		if (summary.state === "common") select.setValue(String(summary.value));

		select.onChange((value) => {
			const originalValue =
				summary.state === "common" ? String(summary.value) : "";
			// "(keep)" is the untouched option, whatever the row started from:
			// picking it back after a change must not read as an explicit clear.
			if (value === "" || value === originalValue) {
				setRowState(undefined, true, idleChip());
			} else {
				setRowState({ action: "set", value }, true, "Will set");
			}
		});

		// The dropdown alone can therefore never express a clear. The × is the
		// only way in; revert is the way out, as it is for every other dirty state.
		if (summary.state !== "empty") {
			const clear = row.createDiv("area-bulk-field-clear clickable-icon");
			clear.setAttribute("aria-label", "Clear on all selected items");
			setIcon(clear, "x");
			clear.addEventListener("click", () => {
				select.setValue("");
				setRowState({ action: "clear" }, true, "Will clear");
			});
		}

		revert.addEventListener("click", () => {
			select.setValue(summary.state === "common" ? String(summary.value) : "");
			setRowState(undefined, true, idleChip());
		});

		setRowState(undefined, true, idleChip());
		return;
	}

	const input = new TextComponent(row);
	if (type === "url") input.inputEl.inputMode = "url";
	if (summary.state === "common") input.setValue(original);
	if (summary.state === "mixed") input.setPlaceholder("Mixed values");

	const readInput = (): void => {
		const raw = input.getValue().trim();
		if (raw === original) {
			setRowState(undefined, true, idleChip());
			return;
		}
		if (raw === "") {
			// Prefilled and emptied → explicit clear. Mixed/empty and still
			// empty → nothing typed, nothing to do.
			if (summary.state === "common") {
				setRowState({ action: "clear" }, true, "Will clear");
			} else {
				setRowState(undefined, true, idleChip());
			}
			return;
		}
		if (type === "number") {
			const n = Number(raw);
			// Infinity parses as a number but is not a storable field value.
			if (!Number.isFinite(n)) {
				setRowState(undefined, false, "Not a number");
				return;
			}
			setRowState({ action: "set", value: n }, true, "Will set");
			return;
		}
		setRowState({ action: "set", value: raw }, true, "Will set");
	};

	input.onChange(readInput);

	// Explicit clear for mixed fields, where there is no text to delete.
	if (summary.state !== "empty") {
		const clear = row.createDiv("area-bulk-field-clear clickable-icon");
		clear.setAttribute("aria-label", "Clear on all selected items");
		setIcon(clear, "x");
		clear.addEventListener("click", () => {
			input.setValue("");
			setRowState({ action: "clear" }, true, "Will clear");
		});
	}

	revert.addEventListener("click", () => {
		input.setValue(original);
		setRowState(undefined, true, idleChip());
	});

	setRowState(undefined, true, idleChip());
}
