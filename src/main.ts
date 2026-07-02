import { Plugin } from "obsidian";
import { FILE_EXT, VIEW_TYPE_AREA, VIEW_TYPE_AREA_DETAIL } from "./constants";
import { DEFAULT_SETTINGS, AreaSettingTab } from "./settings";
import type { AreaPluginSettings } from "./settings";
import { AreaGalleryView } from "./views/AreaGalleryView";
import { ItemDetailView } from "./views/ItemDetailView";
import { registerCommands, openAreaCommand } from "./commands/index";

export default class AreaPlugin extends Plugin {
	settings: AreaPluginSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_AREA,
			(leaf) => new AreaGalleryView(leaf, this),
		);

		this.registerView(
			VIEW_TYPE_AREA_DETAIL,
			(leaf) => new ItemDetailView(leaf, this),
		);

		this.registerExtensions([FILE_EXT], VIEW_TYPE_AREA);

		this.addSettingTab(new AreaSettingTab(this.app, this));

		registerCommands(this);
		this.addRibbonIcon("layout-grid", "Open area", () => {
			openAreaCommand(this);
		});
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
