import { Notice, type App, type TFile } from "obsidian";
import { FileSuggestModal } from "../fileSuggest";
import { isSupportedVaultImageFile } from "./imageFileTypes";

export function openVaultImageSuggest(
	app: App,
	onChoose: (file: TFile) => void,
): void {
	const files = app.vault.getFiles().filter(isSupportedVaultImageFile);
	if (files.length === 0) {
		new Notice("Area: no vault images found.");
		return;
	}

	new FileSuggestModal(app, files, onChoose, "Choose a vault image...").open();
}
