# Task 02 — manifest.json + src/main.ts rewrite

## Depends on

- Task 01: `src/types.ts`, `src/constants.ts` must exist

## Context

The current `src/main.ts` is a sample plugin template — replace it entirely. The new version is minimal: it registers the custom `.area` view, the extension handler, and delegates commands to `src/commands/index.ts`.

Two stubs must be created before `main.ts` will typecheck, because their real implementations come in later tasks.

---

## Stubs to create first

### `src/commands/index.ts` (stub — replaced in Task 04)

```ts
import type AreaPlugin from "./main";
export function registerCommands(_plugin: AreaPlugin): void {}
```

### `src/views/AreaGalleryView.ts` (stub — replaced in Task 03)

```ts
import { TextFileView, type WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_AREA } from "../constants";
import type AreaPlugin from "../main";

export class AreaGalleryView extends TextFileView {
	constructor(leaf: WorkspaceLeaf, _plugin: AreaPlugin) {
		super(leaf);
	}
	getViewType() { return VIEW_TYPE_AREA; }
	getDisplayText() { return "Area"; }
	getViewData() { return ""; }
	setViewData(_data: string, _clear: boolean) {}
	clear() {}
}
```

The constructor must accept `_plugin` (even unused) so `main.ts` can call `new AreaGalleryView(leaf, this)` without a TypeScript error.

---

## Files to modify

### `manifest.json`

Change only these fields:
- `id`: `"area"`
- `name`: `"Area"`
- `description`: `"Visual reference collections for Obsidian"`

Leave `version`, `minAppVersion`, `author`, `authorUrl` unchanged.

### `src/settings.ts` (partial rewrite — full implementation in Task 06)

Replace the existing content with this stub that exports the correct names:

```ts
import { App, PluginSettingTab } from "obsidian";
import type AreaPlugin from "./main";
import { ATTACHMENTS_DIR } from "./constants";

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
	display(): void {}
}
```

### `src/main.ts` (full rewrite)

```ts
import { Plugin } from "obsidian";
import { FILE_EXT, VIEW_TYPE_AREA } from "./constants";
import { DEFAULT_SETTINGS, AreaSettingTab } from "./settings";
import type { AreaPluginSettings } from "./settings";
import { AreaGalleryView } from "./views/AreaGalleryView";
import { registerCommands } from "./commands/index";

export default class AreaPlugin extends Plugin {
	settings: AreaPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_AREA,
			(leaf) => new AreaGalleryView(leaf, this),
		);

		this.registerExtensions([FILE_EXT], VIEW_TYPE_AREA);

		this.addSettingTab(new AreaSettingTab(this.app, this));

		registerCommands(this);
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_AREA);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<AreaPluginSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
```

Note: the ribbon icon is added in Task 04 (it imports `openAreaCommand` from `./commands/index`, which doesn't exist yet).

---

## Verification

```bash
bun run type-check   # zero errors
bun run build        # main.js produced without errors
```

The plugin loads in Obsidian with stubs in place — no startup crash.
