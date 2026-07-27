import { App, ButtonComponent, Modal } from "obsidian";

interface ConfirmModalOptions {
	title: string;
	message: string;
	confirmText: string;
	onConfirm: () => void;
}

/**
 * Yes/no dialog for destructive actions. Replaces the detail view's
 * click-twice-within-4s delete, which asked for confirmation through a tooltip
 * change and a Notice — easy to miss, and easy to complete by accident.
 */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private options: ConfirmModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("area-confirm-modal");
		contentEl.createEl("h3", { text: this.options.title });
		contentEl.createEl("p", { text: this.options.message });

		const buttons = contentEl.createDiv("area-confirm-modal-buttons");
		const cancel = new ButtonComponent(buttons)
			.setButtonText("Cancel")
			.onClick(() => this.close());

		new ButtonComponent(buttons)
			.setButtonText(this.options.confirmText)
			.setWarning()
			.onClick(() => {
				this.close();
				this.options.onConfirm();
			});

		// Land on the safe choice, so a reflexive Enter cancels rather than deletes.
		cancel.buttonEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
