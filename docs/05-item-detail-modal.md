# Task 05 — ItemDetailModal

## Depends on

- Task 01: `src/types.ts` (`AreaItem`, `AreaFile`, `AreaFieldDef`, `FieldType`, `FieldValue`)
- Task 03: `AreaGalleryView` — replace the Notice stub in card click handler

## Context

Modal shown when clicking a card in the gallery. Renders core fields (title, source URL, tags) always, then renders custom fields dynamically from `areaData.schema`. Each field type gets the appropriate input widget.

Changes persist via two distinct callbacks — no `render()` on every keystroke.

## File to create: `src/views/ItemDetailModal.ts`

### Constructor

```ts
import { App, Modal, Notice } from "obsidian";
import type { AreaFile, AreaFieldDef, AreaItem, FieldType, FieldValue } from "../types";

export class ItemDetailModal extends Modal {
	constructor(
		app: App,
		private item: AreaItem,
		private areaData: AreaFile,
		private onDataChanged: () => void,      // requestSave only — no re-render
		private onStructuralChange: () => void, // requestSave + full render (delete)
	) {
		super(app);
	}
}
```

`onDataChanged` is called on every field edit. It should only call `requestSave()` — NOT `render()` — so the grid doesn't flicker while the user is typing.

`onStructuralChange` is called when an item is deleted. Calls both `requestSave()` and `render()`, then modal closes.

---

### onOpen()

```ts
onOpen() {
	const { contentEl } = this;
	contentEl.addClass("area-detail-modal");

	const wrap = contentEl.createDiv("area-detail");

	// Image
	const imgWrap = wrap.createDiv("area-detail-image");
	const img = imgWrap.createEl("img");
	img.src = this.app.vault.adapter.getResourcePath(this.item.vaultPath);
	img.alt = this.item.title ?? "";

	// Metadata
	const meta = wrap.createDiv("area-detail-meta");
	this.renderCoreFields(meta);
	this.renderCustomFields(meta);
	this.renderActions(meta);
}
```

---

### Core fields

```ts
private renderCoreFields(meta: HTMLElement): void {
	// Title
	this.renderTextField(meta, "Title", "text", this.item.title ?? "", (val) => {
		this.item.title = val || undefined;
		this.onDataChanged();
	});

	// Source URL
	this.renderTextField(meta, "Source URL", "url", this.item.sourceUrl ?? "", (val) => {
		this.item.sourceUrl = val.trim() || undefined;
		this.onDataChanged();
	});

	// Tags
	meta.createDiv("area-detail-field", (field) => {
		field.createEl("label", { text: "Tags" });
		const wrap = field.createDiv("area-tag-input-wrap");
		this.renderTagPills(wrap);
	});
}
```

---

### Custom fields (schema-driven)

Renders after core fields. Nothing is rendered if `areaData.schema` is absent or empty.

```ts
private renderCustomFields(meta: HTMLElement): void {
	const schema = this.areaData.schema;
	if (!schema || schema.length === 0) return;

	for (const fieldDef of schema) {
		const current = this.item.fields?.[fieldDef.id];
		meta.createDiv("area-detail-field", (field) => {
			field.createEl("label", { text: fieldDef.label });
			this.renderFieldInput(field, fieldDef, current, (val) => {
				if (!this.item.fields) this.item.fields = {};
				this.item.fields[fieldDef.id] = val;
				this.onDataChanged();
			});
		});
	}
}

private renderFieldInput(
	container: HTMLElement,
	def: AreaFieldDef,
	current: FieldValue | undefined,
	onChange: (val: FieldValue) => void,
): void {
	if (def.type === "select" && def.options) {
		const select = container.createEl("select");
		select.createEl("option", { value: "", text: "—" });
		for (const opt of def.options) {
			const option = select.createEl("option", { value: opt, text: opt });
			if (current === opt) option.selected = true;
		}
		select.addEventListener("change", () => { onChange(select.value); });
		return;
	}

	if (def.type === "number") {
		const input = container.createEl("input", { type: "number" });
		input.value = current !== undefined ? String(current) : "";
		input.addEventListener("input", () => {
			const n = parseFloat(input.value);
			if (!isNaN(n)) onChange(n);
		});
		return;
	}

	// text or url
	this.renderTextField(
		container,
		"",   // label already rendered by caller
		def.type as "text" | "url",
		current !== undefined ? String(current) : "",
		onChange as (val: string) => void,
	);
}
```

---

### Shared helpers

```ts
private renderTextField(
	container: HTMLElement,
	label: string,
	type: "text" | "url",
	value: string,
	onChange: (val: string) => void,
): void {
	const wrap = label
		? container.createDiv("area-detail-field")
		: container;
	if (label) wrap.createEl("label", { text: label });
	const input = wrap.createEl("input", { type });
	input.value = value;
	input.addEventListener("input", () => { onChange(input.value); });
}

private renderTagPills(container: HTMLElement): void {
	container.empty();

	for (const tag of this.item.tags) {
		const pill = container.createSpan({ cls: "area-tag-pill", text: tag });
		pill.setAttribute("role", "button");
		pill.setAttribute("aria-label", `Remove tag ${tag}`);
		pill.addEventListener("click", () => {
			this.item.tags = this.item.tags.filter((t) => t !== tag);
			this.onDataChanged();
			this.renderTagPills(container);
		});
	}

	const input = container.createEl("input", { type: "text" });
	input.placeholder = "Add tag…";
	input.addEventListener("keydown", (e) => {
		if (e.key !== "Enter" && e.key !== ",") return;
		e.preventDefault();
		const value = input.value.trim().replace(/,+$/, "");
		if (value && !this.item.tags.includes(value)) {
			this.item.tags.push(value);
			this.onDataChanged();
			this.renderTagPills(container);
		}
		input.value = "";
	});
}
```

---

### Delete action (double-click confirm pattern)

```ts
private renderActions(meta: HTMLElement): void {
	const actions = meta.createDiv("area-detail-actions");
	const deleteBtn = actions.createEl("button", { text: "Delete image" });
	let confirmPending = false;

	deleteBtn.addEventListener("click", () => {
		if (!confirmPending) {
			deleteBtn.setText("Confirm delete");
			deleteBtn.addClass("mod-warning");
			confirmPending = true;
			window.setTimeout(() => {
				if (confirmPending) {
					deleteBtn.setText("Delete image");
					deleteBtn.removeClass("mod-warning");
					confirmPending = false;
				}
			}, 3000);
		} else {
			const idx = this.areaData.items.findIndex((i) => i.id === this.item.id);
			if (idx !== -1) this.areaData.items.splice(idx, 1);
			this.onStructuralChange();
			this.close();
		}
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

In `src/views/AreaGalleryView.ts`, replace the Notice stub in `renderCard()`:

```ts
import { ItemDetailModal } from "./ItemDetailModal";

card.addEventListener("click", () => {
	new ItemDetailModal(
		this.plugin.app,
		item,
		this.areaData,
		() => this.requestSave(),
		() => { this.requestSave(); this.render(); },
	).open();
});
```

---

## Verification

1. `bun run type-check` — zero errors.
2. Click a card on an area with no schema → only title, source URL, tags visible.
3. Click a card on an area with schema (e.g., `author: text`, `priority: number`, `platform: select`) → custom fields appear below tags.
4. Type in title field — grid does NOT re-render (no flicker).
5. Change a select field → value persisted in `.area` JSON under `item.fields`.
6. Add/remove a tag → pill updates immediately.
7. Delete: first click → "Confirm delete" state. Second click → item removed. Wait 3 s → resets.
