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
	attachmentsDir: string;
	hideDetailHeader: boolean;
}

export const DEFAULT_SETTINGS: AreaPluginSettings = {
	cardSize: "m",
	attachmentsDir: ATTACHMENTS_DIR,
	hideDetailHeader: true,
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
			.setName("Attachments folder")
			.setDesc("Vault-relative path where dropped images are saved.")
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
