# Task 08 — Schema Editor Modal

## Depends on

- Task 01: `src/types.ts` (`AreaFieldDef`, `FieldType`, `AreaFile`)
- Task 03: `AreaGalleryView` toolbar — replace the Notice stub in the schema button handler

## Context

Modal for managing custom field definitions on an area. Triggered by the gear icon in the gallery toolbar. Changes are written directly to `areaData.schema` (by reference) and persisted via `onSave()` callback.

Field defs have a stable `id` (slug, set at creation) and an editable `label`. Reordering and deletion are supported. Deleting a field def does not touch existing item data — `item.fields[id]` values are orphaned silently (they disappear from the UI, remain in the JSON, and can be cleaned up later).

Implementation note: select field options remain editable after creation through the same token editor used elsewhere in the UI. This only changes `schema[].options`; it does not migrate or remove existing `item.fields` values.

## File to create: `src/views/SchemaEditorModal.ts`

### Constructor

```ts
import { App, Modal, Notice, Setting } from "obsidian";
import type { AreaFieldDef, AreaFile, FieldType } from "../types";

export class SchemaEditorModal extends Modal {
	constructor(
		app: App,
		private areaData: AreaFile,
		private onSave: () => void,
	) {
		super(app);
		this.modalEl.addClass("area-schema-modal");
	}
}
```

---

### onOpen()

```ts
onOpen() {
	const { contentEl } = this;
	contentEl.createEl("h2", { text: "Configure fields" });
	contentEl.createEl("p", {
		text: "Fields are custom per area. Each item stores a value for every field defined here.",
		cls: "area-schema-desc",
	});

	const list = contentEl.createDiv("area-schema-list");
	this.renderFieldList(list);

	// "Add field" form at the bottom
	contentEl.createEl("hr");
	this.renderAddForm(contentEl, list);
}
```

---

### Field list

Renders one row per field def. Each row has: label input, read-only type badge, optional select options editor, up/down buttons, delete button.

```ts
private renderFieldList(list: HTMLElement): void {
	list.empty();
	const schema = this.areaData.schema ?? [];

	if (schema.length === 0) {
		list.createEl("p", { text: "No fields yet.", cls: "area-schema-empty" });
		return;
	}

	for (let i = 0; i < schema.length; i++) {
		const def = schema[i];
		const row = list.createDiv("area-schema-row");

		// Label input (editable)
		const labelInput = row.createEl("input", { type: "text", cls: "area-schema-label" });
		labelInput.value = def.label;
		labelInput.addEventListener("input", () => {
			def.label = labelInput.value.trim() || def.label;
			this.onSave();
		});

		// Type badge (read-only after creation)
		row.createSpan({ cls: "area-schema-type", text: def.type });

		// Options badge for select fields
		if (def.type === "select" && def.options?.length) {
			row.createSpan({
				cls: "area-schema-options",
				text: def.options.join(", "),
			});
		}

		// Reorder buttons
		const up = row.createEl("button", { cls: "area-schema-btn-icon", text: "↑" });
		up.setAttribute("aria-label", "Move up");
		up.disabled = i === 0;
		up.addEventListener("click", () => {
			if (i === 0) return;
			[schema[i - 1], schema[i]] = [schema[i], schema[i - 1]];
			this.onSave();
			this.renderFieldList(list);
		});

		const down = row.createEl("button", { cls: "area-schema-btn-icon", text: "↓" });
		down.setAttribute("aria-label", "Move down");
		down.disabled = i === schema.length - 1;
		down.addEventListener("click", () => {
			if (i === schema.length - 1) return;
			[schema[i], schema[i + 1]] = [schema[i + 1], schema[i]];
			this.onSave();
			this.renderFieldList(list);
		});

		// Delete button (double-confirm pattern)
		const del = row.createEl("button", { cls: "area-schema-btn-icon mod-destructive", text: "×" });
		del.setAttribute("aria-label", `Remove field ${def.label}`);
		let pending = false;
		del.addEventListener("click", () => {
			if (!pending) {
				del.setText("Sure?");
				pending = true;
				window.setTimeout(() => { if (pending) { del.setText("×"); pending = false; } }, 2500);
			} else {
				this.areaData.schema = schema.filter((_, j) => j !== i);
				this.onSave();
				this.renderFieldList(list);
			}
		});
	}
}
```

---

### Add field form

A compact inline form: label input, type selector, options input (shown only for `select`), Add button.

```ts
private renderAddForm(container: HTMLElement, list: HTMLElement): void {
	const form = container.createDiv("area-schema-add-form");
	form.createEl("h3", { text: "Add field" });

	let newLabel = "";
	let newType: FieldType = "text";
	let newOptions = "";

	// Label
	const labelInput = form.createEl("input", { type: "text", cls: "area-schema-new-label" });
	labelInput.placeholder = "Field name…";
	labelInput.addEventListener("input", () => { newLabel = labelInput.value; });

	// Type
	const typeSelect = form.createEl("select", { cls: "area-schema-new-type" });
	const fieldTypes: FieldType[] = ["text", "url", "number", "select"];
	for (const t of fieldTypes) {
		typeSelect.createEl("option", { value: t, text: t });
	}

	// Options input — only visible for select
	const optionsWrap = form.createDiv("area-schema-options-wrap");
	optionsWrap.style.display = "none";
	const optionsInput = optionsWrap.createEl("input", { type: "text" });
	optionsInput.placeholder = "option1, option2, option3";
	optionsInput.addEventListener("input", () => { newOptions = optionsInput.value; });

	typeSelect.addEventListener("change", () => {
		newType = typeSelect.value as FieldType;
		optionsWrap.style.display = newType === "select" ? "block" : "none";
	});

	// Submit
	const addBtn = form.createEl("button", { text: "Add field", cls: "mod-cta" });
	addBtn.addEventListener("click", () => {
		const label = newLabel.trim();
		if (!label) {
			new Notice("Field name is required.");
			return;
		}

		// Generate stable slug id from label
		const id = label
			.toLowerCase()
			.replace(/\s+/g, "_")
			.replace(/[^a-z0-9_]/g, "");

		if (!this.areaData.schema) this.areaData.schema = [];

		// Prevent duplicate ids
		if (this.areaData.schema.some((f) => f.id === id)) {
			new Notice(`A field with id "${id}" already exists.`);
			return;
		}

		const def: AreaFieldDef = { id, label, type: newType };
		if (newType === "select") {
			def.options = newOptions
				.split(",")
				.map((o) => o.trim())
				.filter(Boolean);
		}

		this.areaData.schema.push(def);
		this.onSave();
		this.renderFieldList(list);

		// Reset form
		labelInput.value = "";
		newLabel = "";
		optionsInput.value = "";
		newOptions = "";
	});

	// Submit on Enter in label input
	labelInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") addBtn.click();
	});
}
```

---

### onClose()

```ts
onClose() {
	this.contentEl.empty();
}
```

---

## Wiring into AreaGalleryView (update Task 03 file)

In `src/views/AreaGalleryView.ts`, replace the Notice stub in `renderToolbar()`:

```ts
import { SchemaEditorModal } from "./SchemaEditorModal";

// replace the schema button click handler:
schemaBtn.addEventListener("click", () => {
	new SchemaEditorModal(
		this.plugin.app,
		this.areaData,
		() => { this.requestSave(); this.render(); },
	).open();
});
```

---

## CSS classes (add to Task 07)

```css
.area-schema-modal .area-schema-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.area-schema-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--background-secondary);
  border-radius: var(--radius-m);
}

.area-schema-label {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--background-modifier-border);
  color: var(--text-normal);
  font-size: var(--font-ui-small);
  padding: 2px 4px;
}
.area-schema-label:focus { outline: none; border-bottom-color: var(--interactive-accent); }

.area-schema-type {
  font-size: var(--font-ui-small);
  color: var(--text-muted);
  background: var(--background-modifier-border);
  border-radius: 4px;
  padding: 1px 6px;
}

.area-schema-options {
  font-size: var(--font-ui-small);
  color: var(--text-faint);
  font-style: italic;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.area-schema-btn-icon {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.area-schema-btn-icon:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
.area-schema-btn-icon.mod-destructive:hover { color: var(--text-error); }
.area-schema-btn-icon:disabled { opacity: 0.3; cursor: default; }

.area-schema-add-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.area-schema-add-form h3 {
  font-size: var(--font-ui-small);
  color: var(--text-muted);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Gear button in gallery toolbar */
.area-schema-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-s);
  display: flex;
  align-items: center;
}
.area-schema-btn:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
```

---

## Verification

1. `bun run type-check` — zero errors.
2. In Obsidian: gear icon visible in gallery toolbar.
3. Open schema editor → empty state shown.
4. Add a `text` field "Author" → appears in list, gear icon saves to `.area` JSON.
5. Add a `select` field "Platform" with options "Twitter, Dribbble" → shows the options editor.
6. Edit the `select` options after creation → only `schema[].options` changes.
7. Add a `number` field "Priority".
8. Reorder fields with ↑/↓ → order saved.
9. Delete a field → "Sure?" state, then removed.
10. Open item detail modal → custom fields (Author, Platform, Priority) rendered correctly.
11. Fill in values → persisted in `item.fields` in `.area` JSON.
