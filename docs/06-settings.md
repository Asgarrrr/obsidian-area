# Task 06 — Settings

## Depends on

- Task 01: `src/constants.ts`
- Task 02: `src/main.ts` imports `AreaPluginSettings`, `DEFAULT_SETTINGS`, `AreaSettingTab` from `src/settings.ts`
- Task 03: `AreaGalleryView` — this task adds `grid.dataset.cardSize` to its `render()` method

## Files modified by this task

- `src/settings.ts` — replace stub with full implementation
- `src/views/AreaGalleryView.ts` — add one line in `render()` (see below)

---

## `src/settings.ts` (full rewrite)

```ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type AreaPlugin from "./main";
import { ATTACHMENTS_DIR, VIEW_TYPE_AREA } from "./constants";
import type { AreaGalleryView } from "./views/AreaGalleryView";

export interface AreaPluginSettings {
	cardSize: "s" | "m" | "l";
	attachmentsDir: string;
}

export const DEFAULT_SETTINGS: AreaPluginSettings = {
	cardSize: "m",
	attachmentsDir: ATTACHMENTS_DIR,
};

export class AreaSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: AreaPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Card size")
			.setDesc("Width of image cards in the gallery grid.")
			.addDropdown((drop) =>
				drop
					.addOption("s", "Small (140 px)")
					.addOption("m", "Medium (180 px)")
					.addOption("l", "Large (240 px)")
					.setValue(this.plugin.settings.cardSize)
					.onChange(async (value) => {
						this.plugin.settings.cardSize = value as AreaPluginSettings["cardSize"];
						await this.plugin.saveSettings();
						// Re-render any open area views to pick up the new card size
						this.app.workspace.getLeavesOfType(VIEW_TYPE_AREA).forEach((leaf) => {
							(leaf.view as AreaGalleryView).render?.();
						});
					}),
			);

		new Setting(containerEl)
			.setName("Attachments directory")
			.setDesc("Vault-relative path where imported images are stored.")
			.addText((text) =>
				text
					.setPlaceholder(ATTACHMENTS_DIR)
					.setValue(this.plugin.settings.attachmentsDir)
					.onChange(async (value) => {
						this.plugin.settings.attachmentsDir = value.trim() || ATTACHMENTS_DIR;
						await this.plugin.saveSettings();
					}),
			);
	}
}
```

Note on the import of `AreaGalleryView`: it is imported as a **type only** (`import type`) to avoid a circular dependency (`settings → main → settings`). The cast `leaf.view as AreaGalleryView` is safe because `getLeavesOfType(VIEW_TYPE_AREA)` only returns leaves that hold that view type.

Make the import explicit:

```ts
import type { AreaGalleryView } from "./views/AreaGalleryView";
```

And the cast:

```ts
(leaf.view as AreaGalleryView).render?.();
```

`render` is declared `private` in Task 03 — change it to **`render(): void`** (no access modifier, i.e. public) so the settings tab can call it. Alternatively mark it `/* @internal */` and keep the optional-call pattern.

---

## `src/views/AreaGalleryView.ts` — one-line addition

Inside `render()`, after the grid element is created, set the card size attribute:

```ts
const grid = this.contentEl.createDiv("area-grid");
grid.dataset.cardSize = this.plugin.settings.cardSize; // ← add this line
```

This line already appears in the Task 03 spec — confirm it is present before starting this task.

---

## Verification

1. `bun run type-check` — zero errors (including no circular dependency error).
2. In Obsidian: **Settings → Area** — two settings visible and styled correctly.
3. Change card size while an area is open → cards resize immediately.
4. Change attachments dir → add image via D&D → file written to the new path.
