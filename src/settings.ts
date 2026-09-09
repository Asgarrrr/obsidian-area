import { PluginSettingTab, Setting } from "obsidian";
import type AreaPlugin from "./main";
import {
	ATTACHMENTS_DIR,
	VIEW_TYPE_AREA,
	VIEW_TYPE_AREA_DETAIL,
} from "./constants";
import type { AreaGalleryView } from "./views/AreaGalleryView";
import type { ItemDetailView } from "./views/ItemDetailView";

export interface AreaPluginSettings {
	cardSize: "s" | "m" | "l";
	showCardTitles: boolean;
	attachmentsDir: string;
	hideDetailHeader: boolean;
	addToAreaTarget: "ask" | "active-area";
}

export const DEFAULT_SETTINGS: AreaPluginSettings = {
	cardSize: "m",
	showCardTitles: true,
	attachmentsDir: ATTACHMENTS_DIR,
	hideDetailHeader: true,
	addToAreaTarget: "ask",
};

export class AreaSettingTab extends PluginSettingTab {
	// The base stores the plugin as the generic `Plugin`; expose it typed rather
	// than keeping a second field pointing at the same object.
	private get areaPlugin(): AreaPlugin {
		return this.plugin as AreaPlugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Card size")
			.setDesc("Default size for gallery cards.")
			.addDropdown((drop) =>
				drop
					.addOption("s", "Small")
					.addOption("m", "Medium")
					.addOption("l", "Large")
					.setValue(this.areaPlugin.settings.cardSize)
					.onChange(async (value) => {
						this.areaPlugin.settings.cardSize = value as "s" | "m" | "l";
						await this.areaPlugin.saveSettings();
						this.app.workspace
							.getLeavesOfType(VIEW_TYPE_AREA)
							.forEach((leaf) => {
								(leaf.view as AreaGalleryView).refreshCardSize?.();
							});
					}),
			);

		new Setting(containerEl)
			.setName("Show card titles")
			.setDesc("Caption gallery cards with their title, over two lines.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.areaPlugin.settings.showCardTitles)
					.onChange(async (value) => {
						this.areaPlugin.settings.showCardTitles = value;
						await this.areaPlugin.saveSettings();
						this.app.workspace
							.getLeavesOfType(VIEW_TYPE_AREA)
							.forEach((leaf) => {
								(leaf.view as AreaGalleryView).rerenderGrid?.();
							});
					}),
			);

		new Setting(containerEl)
			.setName("Hide detail header")
			.setDesc("Hide Obsidian's view header bar on the item detail tab.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.areaPlugin.settings.hideDetailHeader)
					.onChange(async (value) => {
						this.areaPlugin.settings.hideDetailHeader = value;
						await this.areaPlugin.saveSettings();
						this.app.workspace
							.getLeavesOfType(VIEW_TYPE_AREA_DETAIL)
							.forEach((leaf) => {
								(leaf.view as ItemDetailView).applyHeaderVisibility?.();
							});
					}),
			);

		new Setting(containerEl)
			.setName("“Add to area” destination")
			.setDesc(
				"Always ask which area to add to, or add straight into the open " +
					"area when exactly one is open.",
			)
			.addDropdown((drop) =>
				drop
					.addOption("ask", "Always ask")
					.addOption("active-area", "Use the open area")
					.setValue(this.areaPlugin.settings.addToAreaTarget)
					.onChange(async (value) => {
						this.areaPlugin.settings.addToAreaTarget = value as
							| "ask"
							| "active-area";
						await this.areaPlugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Attachments folder")
			.setDesc(
				"Vault-relative path where dropped images are saved. Folders " +
					"starting with a dot stay hidden from Obsidian, so images stored " +
					"there cannot be opened in a tab or revealed in Files.",
			)
			.addText((text) =>
				text
					.setPlaceholder(ATTACHMENTS_DIR)
					.setValue(this.areaPlugin.settings.attachmentsDir)
					.onChange(async (value) => {
						this.areaPlugin.settings.attachmentsDir =
							value.trim() || ATTACHMENTS_DIR;
						await this.areaPlugin.saveSettings();
					}),
			);
	}
}
