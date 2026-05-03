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
	constructor(
		app: App,
		private plugin: AreaPlugin,
	) {
		super(app, plugin);
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
					.setValue(this.plugin.settings.cardSize)
					.onChange(async (value) => {
						this.plugin.settings.cardSize = value as "s" | "m" | "l";
						await this.plugin.saveSettings();
						this.app.workspace
							.getLeavesOfType(VIEW_TYPE_AREA)
							.forEach((leaf) => {
								(leaf.view as AreaGalleryView).refreshCardSize?.();
							});
					}),
			);

		new Setting(containerEl)
			.setName("Attachments folder")
			.setDesc("Vault-relative path where dropped images are saved.")
			.addText((text) =>
				text
					.setPlaceholder(ATTACHMENTS_DIR)
					.setValue(this.plugin.settings.attachmentsDir)
					.onChange(async (value) => {
						this.plugin.settings.attachmentsDir =
							value.trim() || ATTACHMENTS_DIR;
						await this.plugin.saveSettings();
					}),
			);
	}
}
