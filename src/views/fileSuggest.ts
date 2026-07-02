import { FuzzySuggestModal, type App, type TFile } from "obsidian";

/**
 * Fuzzy picker over a fixed list of vault files. Shared by the "Open area" and
 * "Add existing vault image" flows, which only differ by their file list and
 * placeholder text.
 */
export class FileSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private files: TFile[],
		private onChoose: (file: TFile) => void,
		placeholder: string,
	) {
		super(app);
		this.setPlaceholder(placeholder);
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
