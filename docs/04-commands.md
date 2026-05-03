# Task 04 — Commands

## Depends on

- Task 01: `src/types.ts`, `src/constants.ts`
- Task 02: `src/main.ts` (imports `registerCommands`), stub `src/commands/index.ts` exists
- Task 03: `AreaGalleryView` with public `addItem(item)` and `importFiles(files)` methods

## Files modified by this task

- `src/commands/index.ts` — replace stub with full implementation
- `src/main.ts` — add ribbon icon (one import + one line in `onload`)

---

## `src/commands/index.ts`

### Helper — get active AreaGalleryView

```ts
import { App, Notice, SuggestModal, type TFile } from "obsidian";
import type AreaPlugin from "../main";
import { AreaGalleryView } from "../views/AreaGalleryView";

function getActiveAreaView(app: App): AreaGalleryView | null {
	const leaf = app.workspace.activeLeaf;
	return leaf?.view instanceof AreaGalleryView ? leaf.view : null;
}
```

---

### Command 1 — "New area"

ID: `area:new` | Name: `"New area"`

```ts
async function newAreaCommand(plugin: AreaPlugin): Promise<void> {
	new NewAreaModal(plugin.app, async (name: string) => {
		const slug = name
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");

		// Resolve parent folder: same folder as the active file, or vault root
		const activeFile = plugin.app.workspace.getActiveFile();
		const parent = plugin.app.fileManager.getNewFileParent(
			activeFile?.path ?? "",
		);

		let path = `${parent.path === "/" ? "" : parent.path + "/"}${slug}.area`;
		let n = 2;
		while (await plugin.app.vault.adapter.exists(path)) {
			path = path.replace(/(-\d+)?\.area$/, `-${n}.area`);
			n++;
		}

		const content = JSON.stringify(
			{ version: "1", name, items: [] },
			null,
			2,
		);
		const file = await plugin.app.vault.create(path, content);
		await plugin.app.workspace.getLeaf(false).openFile(file);
	}).open();
}

class NewAreaModal extends Modal {
	private name = "";

	constructor(app: App, private onSubmit: (name: string) => Promise<void>) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "New area" });

		const input = contentEl.createEl("input", { type: "text" });
		input.placeholder = "Area name…";
		input.style.cssText = "width:100%;margin-bottom:12px";
		input.addEventListener("input", () => { this.name = input.value; });
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && this.name.trim()) this.submit();
		});

		const btn = contentEl.createEl("button", { text: "Create" });
		btn.addEventListener("click", () => { if (this.name.trim()) this.submit(); });

		// Focus input immediately
		window.setTimeout(() => input.focus(), 50);
	}

	private submit() {
		this.close();
		this.onSubmit(this.name.trim());
	}

	onClose() {
		this.contentEl.empty();
	}
}
```

Import `Modal` from `"obsidian"` at the top of the file.

---

### Command 2 — "Add image to area"

ID: `area:add-image` | Name: `"Add image to area"`

Only available when an `AreaGalleryView` is active (`checkCallback`).

```ts
function addImageCommand(view: AreaGalleryView): void {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "image/*";
	input.multiple = true;
	input.style.display = "none";
	document.body.appendChild(input);

	// Remove the input INSIDE the handler — not before the change event fires
	input.addEventListener("change", async () => {
		const files = Array.from(input.files ?? []);
		document.body.removeChild(input);
		if (files.length > 0) {
			await view.importFiles(files);
		}
	});

	// If the user dismisses the dialog without selecting, clean up
	window.addEventListener(
		"focus",
		() => {
			window.setTimeout(() => {
				if (document.body.contains(input)) {
					document.body.removeChild(input);
				}
			}, 300);
		},
		{ once: true },
	);

	input.click();
}
```

---

### Command 3 — "Open area"

ID: `area:open` | Name: `"Open area"`

`FuzzyAreaSuggest` extends Obsidian's abstract `FuzzySuggestModal<TFile>`:

```ts
class FuzzyAreaSuggest extends FuzzySuggestModal<TFile> {
	constructor(app: App) {
		super(app);
		this.setPlaceholder("Choose an area…");
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter((f) => f.extension === "area");
	}

	getItemText(file: TFile): string {
		return `${file.basename}  ${file.parent?.path ?? ""}`;
	}

	onChooseItem(file: TFile): void {
		this.app.workspace.getLeaf(false).openFile(file);
	}
}

function openAreaCommand(plugin: AreaPlugin): void {
	const areas = plugin.app.vault.getFiles().filter((f) => f.extension === "area");
	if (areas.length === 0) {
		new Notice("No areas found. Use 'New area' to create one.");
		return;
	}
	new FuzzyAreaSuggest(plugin.app).open();
}
```

Import `FuzzySuggestModal` from `"obsidian"`.

---

### `registerCommands` export

```ts
export function registerCommands(plugin: AreaPlugin): void {
	plugin.addCommand({
		id: "area:new",
		name: "New area",
		callback: () => { newAreaCommand(plugin); },
	});

	plugin.addCommand({
		id: "area:add-image",
		name: "Add image to area",
		checkCallback: (checking) => {
			const view = getActiveAreaView(plugin.app);
			if (!view) return false;
			if (!checking) addImageCommand(view);
			return true;
		},
	});

	plugin.addCommand({
		id: "area:open",
		name: "Open area",
		callback: () => { openAreaCommand(plugin); },
	});
}

export { openAreaCommand };
```

---

## `src/main.ts` — add ribbon icon

Add one import and one line in `onload()`. The rest of `main.ts` is unchanged from Task 02.

```ts
// Add to imports:
import { openAreaCommand } from "./commands/index";

// Add at end of onload(), after registerCommands(this):
this.addRibbonIcon("layout-grid", "Open area", () => {
	openAreaCommand(this);
});
```

---

## Verification

1. `bun run type-check` — zero errors.
2. `bun run build` — builds clean.
3. In Obsidian:
   - Command palette → "New area" → enter name → `.area` file created and opened.
   - With area open, command "Add image to area" → file picker → select PNG → image appears in grid.
   - Dismiss file picker without selecting → no crash, no orphan `<input>` in DOM.
   - Command "Open area" → fuzzy list of `.area` files → select → opens gallery.
   - Ribbon icon → same as "Open area".
