# Task 03 — AreaGalleryView

## Depends on

- Task 01: `src/types.ts`, `src/constants.ts`
- Task 02: `src/main.ts`, stub `src/views/AreaGalleryView.ts` exists

## Context

The main view. Replace the stub at `src/views/AreaGalleryView.ts` with a full `TextFileView` implementation. Renders an image grid from the `.area` file's JSON. No framework — vanilla DOM only.

`TextFileView` is the right base class (not `ItemView`): Obsidian calls `setViewData(data, clear)` when the file loads and `getViewData()` when it needs to save. This handles file lifecycle automatically.

This task also owns **drag & drop** and the **schema editor button** in the toolbar (the button opens `SchemaEditorModal` from Task 08 — use a stub import for now).

## File to replace: `src/views/AreaGalleryView.ts`

### Responsibilities

- Parse/serialize the `.area` JSON
- Render a responsive image grid
- Filter by tags (chip toggles) and text search
- Handle drag & drop of image files onto the view
- Show a schema editor button in the toolbar (Task 08 wires the modal)
- Pass click events to `ItemDetailModal` (stub call for now — Task 05 wires it)
- Accept new items pushed from commands (Task 04 calls `view.addItem(item)` and `view.importFiles(files)`)

### Constructor signature

```ts
constructor(leaf: WorkspaceLeaf, private plugin: AreaPlugin)
```

In `onload()`, apply the root CSS class and register drag & drop:

```ts
onload() {
	this.contentEl.addClass("area-view");
	this.registerDragAndDrop();
}
```

### State

Initialize inline — `areaData` must never be `undefined`:

```ts
private areaData: AreaFile = { version: "1", name: "", items: [] };
private activeTagFilters: Set<string> = new Set();
private searchQuery = "";
```

### TextFileView overrides

```ts
getViewType(): string  // return VIEW_TYPE_AREA
getDisplayText(): string  // return this.areaData.name || "Area"
getIcon(): string  // return "layout-grid"

getViewData(): string
// return JSON.stringify(this.areaData, null, 2)

setViewData(data: string, _clear: boolean): void
// try { this.areaData = JSON.parse(data) as AreaFile; }
// catch { new Notice("Area: could not parse file"); }
// this.render()

clear(): void
// this.areaData = { version: "1", name: "", items: [] }
// this.render()
```

### render()

`render()` must be **public** (no access modifier) so the settings tab (Task 06) can call it.

```ts
render(): void {
	this.contentEl.empty();
	this.contentEl.addClass("area-view");

	const toolbar = this.contentEl.createDiv("area-toolbar");
	this.renderToolbar(toolbar);

	const grid = this.contentEl.createDiv("area-grid");
	grid.dataset.cardSize = this.plugin.settings.cardSize;

	for (const item of this.getFilteredItems()) {
		this.renderCard(grid, item);
	}
}
```

### Toolbar

The toolbar contains: search input, tag chips, and a schema editor button (right-aligned).

```ts
private renderToolbar(toolbar: HTMLElement): void {
	const left = toolbar.createDiv("area-toolbar-left");

	const search = left.createEl("input", { cls: "area-search" });
	search.type = "search";
	search.placeholder = "Search…";
	search.value = this.searchQuery;
	search.addEventListener("input", () => {
		this.searchQuery = search.value.toLowerCase().trim();
		this.render();
	});

	const tagRow = left.createDiv("area-tags");
	const allTags = [...new Set(this.areaData.items.flatMap((i) => i.tags))].sort();
	for (const tag of allTags) {
		const chip = tagRow.createEl("button", { cls: "area-tag-chip", text: tag });
		if (this.activeTagFilters.has(tag)) chip.addClass("is-active");
		chip.addEventListener("click", () => {
			this.activeTagFilters.has(tag)
				? this.activeTagFilters.delete(tag)
				: this.activeTagFilters.add(tag);
			this.render();
		});
	}

	// Schema editor button — right side of toolbar
	const schemaBtn = toolbar.createEl("button", { cls: "area-schema-btn" });
	schemaBtn.setAttribute("aria-label", "Configure fields");
	setIcon(schemaBtn, "settings-2");
	schemaBtn.addEventListener("click", () => {
		// stub — Task 08 replaces this with:
		// new SchemaEditorModal(this.plugin.app, this.areaData, () => { this.requestSave(); this.render(); }).open();
		new Notice("Schema editor — coming in Task 08");
	});
}
```

Import `setIcon` from `"obsidian"`.

### Cards

```ts
private renderCard(grid: HTMLElement, item: AreaItem): void {
	const card = grid.createDiv("area-card");
	const img = card.createEl("img");
	img.loading = "lazy";
	img.src = this.plugin.app.vault.adapter.getResourcePath(item.vaultPath);

	const overlay = card.createDiv("area-card-overlay");
	const tagRow = overlay.createDiv("area-card-tags");
	for (const tag of item.tags) {
		tagRow.createSpan({ cls: "area-tag-pill", text: tag });
	}
	if (item.sourceUrl) {
		const link = overlay.createEl("a", { cls: "area-card-source" });
		link.href = item.sourceUrl;
		link.target = "_blank";
		link.rel = "noopener";
		link.setAttribute("aria-label", "Open source");
	}

	card.addEventListener("click", () => {
		// stub — Task 05 replaces this with ItemDetailModal
		new Notice(item.title ?? item.vaultPath);
	});
}
```

### Filtering

`searchQuery` is stored **already lowercased** (normalized at input time). The filter does not call `.toLowerCase()` again except on item data.

```ts
private getFilteredItems(): AreaItem[] {
	return this.areaData.items.filter((item) => {
		const matchesTags =
			this.activeTagFilters.size === 0 ||
			item.tags.some((t) => this.activeTagFilters.has(t));
		const matchesSearch =
			this.searchQuery === "" ||
			(item.title?.toLowerCase().includes(this.searchQuery) ?? false) ||
			item.tags.some((t) => t.toLowerCase().includes(this.searchQuery)) ||
			(item.sourceUrl?.toLowerCase().includes(this.searchQuery) ?? false);
		return matchesTags && matchesSearch;
	});
}
```

### Drag & drop

Registered in `onload()`. Lives here, not in commands.

```ts
private registerDragAndDrop(): void {
	this.registerDomEvent(this.contentEl, "dragover", (e: DragEvent) => {
		e.preventDefault();
		e.dataTransfer!.dropEffect = "copy";
	});

	this.registerDomEvent(this.contentEl, "drop", async (e: DragEvent) => {
		e.preventDefault();
		const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
			f.type.startsWith("image/"),
		);
		if (files.length === 0) return;
		await this.importFiles(files);
	});
}
```

### `importFiles` (shared by D&D and Task 04 command)

```ts
async importFiles(files: File[]): Promise<void> {
	const dir = this.plugin.settings.attachmentsDir;
	const adapter = this.plugin.app.vault.adapter;

	if (!(await adapter.exists(dir))) {
		await adapter.mkdir(dir);
	}

	for (const file of files) {
		const ext = file.name.split(".").pop() ?? "png";
		const id = crypto.randomUUID();
		const destPath = `${dir}/${id}.${ext}`;
		const buffer = await file.arrayBuffer();
		await this.plugin.app.vault.createBinary(destPath, buffer);

		const item: AreaItem = {
			id,
			type: "image",
			vaultPath: destPath,
			tags: [],
			addedAt: Date.now(),
		};
		await this.addItem(item);
	}

	new Notice(`Added ${files.length} image${files.length > 1 ? "s" : ""}`);
}
```

### Public methods for Task 04

```ts
async addItem(item: AreaItem): Promise<void> {
	this.areaData.items.unshift(item);
	this.requestSave();
	this.render();
}
```

## Verification

1. Manually create a test `.area` file:
   ```json
   {
     "version": "1",
     "name": "Test",
     "schema": [
       { "id": "author", "label": "Author", "type": "text" }
     ],
     "items": [
       {
         "id": "test-1",
         "type": "image",
         "vaultPath": ".attachments/area/test.png",
         "tags": ["ui", "dark"],
         "addedAt": 1705363200000,
         "fields": { "author": "Rauno" }
       }
     ]
   }
   ```
2. Place a real image at the vaultPath.
3. `bun run build` → reload plugin in Obsidian.
4. Double-click the `.area` file → grid renders.
5. Schema editor button visible in toolbar (shows Notice for now).
6. Drag a PNG onto the view → image appears in grid, `.area` file updated.
7. Click a tag chip → filter applies.
8. Type uppercase in search → still matches (case-insensitive).
9. `bun run type-check` — zero errors.
