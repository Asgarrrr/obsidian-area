import {
	App,
	ButtonComponent,
	DropdownComponent,
	Modal,
	Notice,
	setIcon,
	TextComponent,
} from "obsidian";
import type { AreaFile, AreaFieldDef, FieldType } from "../types";
import { renderSelectOptionsEditor } from "./schema-editor/optionsEditor";
import { createFieldId, parseSelectOptions } from "./schema-editor/schemaUtils";

const FIELD_TYPES: FieldType[] = ["text", "url", "number", "select"];
const DELETE_CONFIRM_MS = 2500;

export class SchemaEditorModal extends Modal {
	private deleteConfirmTimer: number | null = null;
	private pendingDeleteButton: ButtonComponent | null = null;

	constructor(
		app: App,
		private areaData: AreaFile,
		private onDataChanged: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass("area-schema-modal");
		this.render();
	}

	onClose(): void {
		this.clearDeleteConfirmTimer();
		this.contentEl.empty();
	}

	private get schema(): AreaFieldDef[] {
		if (!this.areaData.schema) this.areaData.schema = [];
		return this.areaData.schema;
	}

	private render(): void {
		this.clearDeleteConfirmTimer();
		this.contentEl.empty();
		this.contentEl.addClass("area-schema-modal");

		const list = this.contentEl.createDiv("area-schema-list");
		if (this.schema.length === 0) {
			list.createEl("p", {
				cls: "area-schema-empty",
				text: "No fields yet.",
			});
		}
		for (let i = 0; i < this.schema.length; i++) {
			this.renderRow(list, i);
		}
		this.renderAddForm(this.contentEl);
	}

	private renderRow(container: HTMLElement, index: number): void {
		const schema = this.schema;
		const def = schema[index];
		if (!def) return;

		const row = container.createDiv("area-schema-row");

		const labelInput = new TextComponent(row).setValue(def.label);
		labelInput.inputEl.addClass("area-schema-label");
		labelInput.inputEl.addEventListener("blur", () => {
			const val = labelInput.getValue().trim();
			if (val && val !== def.label) {
				def.label = val;
				this.onDataChanged();
			} else {
				labelInput.setValue(def.label);
			}
		});
		labelInput.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") labelInput.inputEl.blur();
		});

		row.createSpan({
			cls: "area-schema-type",
			text: def.type,
		});

		if (def.type === "select") {
			const optWrap = row.createDiv("area-schema-options");
			renderSelectOptionsEditor(optWrap, def, this.onDataChanged);
		}

		const controls = row.createDiv("area-schema-row-controls");

		const upBtn = new ButtonComponent(controls)
			.setIcon("chevron-up")
			.setTooltip("Move up")
			.setDisabled(index === 0)
			.onClick(() => {
				const previous = schema[index - 1];
				const current = schema[index];
				if (!previous || !current) return;
				schema[index - 1] = current;
				schema[index] = previous;
				this.onDataChanged();
				this.render();
			});
		upBtn.buttonEl.setAttribute("aria-label", "Move up");

		const downBtn = new ButtonComponent(controls)
			.setIcon("chevron-down")
			.setTooltip("Move down")
			.setDisabled(index === schema.length - 1)
			.onClick(() => {
				const current = schema[index];
				const next = schema[index + 1];
				if (!current || !next) return;
				schema[index] = next;
				schema[index + 1] = current;
				this.onDataChanged();
				this.render();
			});
		downBtn.buttonEl.setAttribute("aria-label", "Move down");

		const delBtn = new ButtonComponent(controls)
			.setIcon("trash-2")
			.setTooltip("Delete field")
			.setWarning()
			.onClick(() => {
				this.handleDeleteClick(delBtn, schema, index);
			});
		delBtn.buttonEl.setAttribute("aria-label", "Delete field");
	}

	private renderAddForm(container: HTMLElement): void {
		const form = container.createDiv("area-schema-add");

		const labelInput = new TextComponent(form).setPlaceholder("Field label…");

		const typeSelect = new DropdownComponent(form);
		for (const t of FIELD_TYPES) {
			typeSelect.addOption(t, t);
		}

		const optionsInput = new TextComponent(form).setPlaceholder(
			"Options separated by commas",
		);
		optionsInput.inputEl.addClass("area-schema-options-input");
		const syncOptionsInput = () => {
			optionsInput.inputEl.style.display =
				typeSelect.getValue() === "select" ? "" : "none";
		};
		typeSelect.onChange(syncOptionsInput);
		syncOptionsInput();

		const doAdd = () => {
			const label = labelInput.getValue().trim();
			if (!label) return;
			const type = typeSelect.getValue() as FieldType;
			const id = createFieldId(label);
			if (this.schema.some((def) => def.id === id)) {
				new Notice(`A field with id "${id}" already exists.`);
				return;
			}

			const def: AreaFieldDef = {
				id,
				label,
				type,
			};
			if (type === "select") {
				def.options = parseSelectOptions(optionsInput.getValue());
			}

			this.schema.push(def);
			this.onDataChanged();
			labelInput.setValue("");
			optionsInput.setValue("");
			this.render();
		};

		new ButtonComponent(form)
			.setButtonText("Add field")
			.setCta()
			.setClass("area-schema-add-button")
			.onClick(doAdd);
		labelInput.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") doAdd();
		});
	}

	private handleDeleteClick(
		button: ButtonComponent,
		schema: AreaFieldDef[],
		index: number,
	): void {
		if (button.buttonEl.dataset.confirmDelete === "true") {
			schema.splice(index, 1);
			this.onDataChanged();
			this.render();
			return;
		}

		this.clearDeleteConfirmTimer();
		button.buttonEl.dataset.confirmDelete = "true";
		button.setButtonText("Sure?");
		button.setTooltip("Click again to remove this field");
		this.pendingDeleteButton = button;
		this.deleteConfirmTimer = window.setTimeout(() => {
			this.restoreDeleteButton(button);
			if (this.pendingDeleteButton === button) this.pendingDeleteButton = null;
			this.deleteConfirmTimer = null;
		}, DELETE_CONFIRM_MS);
	}

	private clearDeleteConfirmTimer(): void {
		if (this.deleteConfirmTimer !== null) {
			window.clearTimeout(this.deleteConfirmTimer);
			this.deleteConfirmTimer = null;
		}
		if (this.pendingDeleteButton) {
			this.restoreDeleteButton(this.pendingDeleteButton);
			this.pendingDeleteButton = null;
		}
	}

	private restoreDeleteButton(button: ButtonComponent): void {
		button.buttonEl.dataset.confirmDelete = "false";
		button.buttonEl.empty();
		setIcon(button.buttonEl, "trash-2");
		button.setTooltip("Delete field");
	}
}
