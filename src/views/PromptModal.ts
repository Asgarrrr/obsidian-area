import { App, ButtonComponent, Modal, TextComponent } from "obsidian";

interface PromptModalOptions {
	title: string;
	placeholder?: string;
	initialValue?: string;
	confirmText: string;
	onSubmit: (value: string) => void;
}

/**
 * Single-line text prompt. Obsidian ships no such dialog, and naming a saved
 * view through a Notice or an inline input would either lose the value on a
 * stray click or need its own dismissal handling.
 */
export class PromptModal extends Modal {
	constructor(
		app: App,
		private options: PromptModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("area-prompt-modal");
		contentEl.createEl("h3", { text: this.options.title });

		const input = new TextComponent(contentEl)
			.setPlaceholder(this.options.placeholder ?? "")
			.setValue(this.options.initialValue ?? "");
		input.inputEl.addClass("area-prompt-input");

		const buttons = contentEl.createDiv("area-prompt-buttons");
		new ButtonComponent(buttons)
			.setButtonText("Cancel")
			.onClick(() => this.close());

		const confirm = new ButtonComponent(buttons)
			.setButtonText(this.options.confirmText)
			.setCta()
			.onClick(() => this.submit(input.getValue()));

		const syncEnabled = () => {
			confirm.setDisabled(input.getValue().trim() === "");
		};
		input.onChange(syncEnabled);
		syncEnabled();

		input.inputEl.addEventListener("keydown", (evt) => {
			if (evt.key !== "Enter") return;
			evt.preventDefault();
			this.submit(input.getValue());
		});

		// Selected, not just focused: renaming usually replaces the whole label.
		input.inputEl.focus();
		input.inputEl.select();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(raw: string): void {
		const value = raw.trim();
		if (value === "") return;
		this.close();
		this.options.onSubmit(value);
	}
}
