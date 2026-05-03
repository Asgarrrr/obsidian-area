import { FuzzySuggestModal, Notice, type App, type TFile } from "obsidian";
import { isSupportedVaultImageFile } from "./importImages";

export function openVaultImageSuggest(
	app: App,
	onChoose: (file: TFile) => void,
): void {
	const files = app.vault.getFiles().filter(isSupportedVaultImageFile);
	if (files.length === 0) {
		new Notice("Area: no vault images found.");
		return;
	}

	new VaultImageSuggestModal(app, files, onChoose).open();
}

class VaultImageSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private files: TFile[],
		private onChoose: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder("Choose a vault image...");
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(file: TFile): string {
		return `${file.basename}  ${file.parent?.path ?? ""}`;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}
