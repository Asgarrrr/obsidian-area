import { type App, ButtonComponent, Modal, Notice } from "obsidian";
import type { AreaFieldDef } from "../types";
import {
	type BulkPatch,
	isEmptyPatch,
	type PatchAction,
	pillsToTagPatch,
	type SelectionSummary,
	type TagPill,
} from "./area-gallery/bulkEdit";
import { renderBulkFieldRow } from "./BulkFieldRows";
import { type BulkTagEditorHandle, renderBulkTagEditor } from "./BulkTagEditor";
import { ConfirmModal } from "./ConfirmModal";

interface BulkEditModalOptions {
	summary: SelectionSummary;
	schema: AreaFieldDef[];
	hiddenCount: number;
	getTagSuggestions: () => string[];
	/**
	 * Runs the guarded commit. Resolves after a successful save — except when
	 * the patch nets zero item changes, where no save is needed or attempted.
	 */
	onApply: (patch: BulkPatch) => Promise<void>;
	/** Called once the modal has actually closed, whatever the path. */
	onClosed?: () => void;
}

export class BulkEditModal extends Modal {
	private pills: TagPill[] = [];
	private sourceEntry: PatchAction | undefined;
	private fieldEntries = new Map<string, PatchAction>();
	private invalidFields = new Set<string>();
	private applyButton: ButtonComponent | null = null;
	private tagEditor: BulkTagEditorHandle | null = null;
	private closeConfirmed = false;

	constructor(
		app: App,
		private options: BulkEditModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		this.resetDraft();
		this.render();
	}

	onClose(): void {
		this.tagEditor?.close();
		this.contentEl.empty();
		this.options.onClosed?.();
	}

	// Esc and scrim clicks land here. A dirty draft asks before discarding —
	// minutes of pill curation must not die on a reflexive background click.
	// An invalid field builds no patch but still holds typed content, so it
	// counts as dirty too, and so does a tag typed but not yet committed.
	close(): void {
		const dirty =
			!isEmptyPatch(this.buildPatch()) ||
			this.invalidFields.size > 0 ||
			(this.tagEditor?.hasPendingInput() ?? false);
		if (!this.closeConfirmed && dirty) {
			new ConfirmModal(this.app, {
				title: "Discard changes?",
				message: "The bulk edit draft has unsaved changes.",
				confirmText: "Discard",
				onConfirm: () => {
					this.closeConfirmed = true;
					this.close();
				},
			}).open();
			return;
		}
		super.close();
	}

	private resetDraft(): void {
		this.pills = this.options.summary.pills.map((pill) => ({ ...pill }));
		this.sourceEntry = undefined;
		this.fieldEntries.clear();
		this.invalidFields.clear();
	}

	private buildPatch(): BulkPatch {
		return {
			...pillsToTagPatch(this.pills),
			sourceUrl: this.sourceEntry,
			fields: Object.fromEntries(this.fieldEntries),
		};
	}

	private syncApplyState(): void {
		this.applyButton?.setDisabled(
			isEmptyPatch(this.buildPatch()) || this.invalidFields.size > 0,
		);
	}

	private render(): void {
		const { contentEl } = this;
		const { summary, schema, hiddenCount } = this.options;
		contentEl.empty();
		contentEl.addClass("area-bulk-edit-modal");

		contentEl.createEl("h3", { text: "Edit selection" });
		const scope = contentEl.createDiv("area-bulk-edit-scope");
		scope.setText(
			hiddenCount > 0
				? `${summary.total} items — ${hiddenCount} hidden by filters included`
				: `${summary.total} items`,
		);

		const tagsSection = contentEl.createDiv("area-bulk-edit-section");
		tagsSection.createDiv({
			cls: "area-bulk-edit-section-title",
			text: "Tags",
		});
		this.tagEditor?.close();
		this.tagEditor = renderBulkTagEditor({
			app: this.app,
			container: tagsSection.createDiv(),
			pills: this.pills,
			total: summary.total,
			getSuggestions: this.options.getTagSuggestions,
			onChange: () => this.syncApplyState(),
		});

		const fieldsSection = contentEl.createDiv("area-bulk-edit-section");
		fieldsSection.createDiv({
			cls: "area-bulk-edit-section-title",
			text: "Fields",
		});
		renderBulkFieldRow({
			container: fieldsSection,
			label: "Source URL",
			type: "url",
			summary: summary.sourceUrl,
			onChange: (entry, valid) => {
				this.sourceEntry = entry;
				this.trackValidity("sourceUrl", valid);
			},
		});
		for (const def of schema) {
			renderBulkFieldRow({
				container: fieldsSection,
				label: def.label,
				type: def.type,
				options: def.options,
				summary: summary.fields[def.id] ?? { state: "empty" },
				onChange: (entry, valid) => {
					if (entry) this.fieldEntries.set(def.id, entry);
					else this.fieldEntries.delete(def.id);
					this.trackValidity(def.id, valid);
				},
			});
		}

		const buttons = contentEl.createDiv("area-bulk-edit-buttons");
		new ButtonComponent(buttons).setButtonText("Reset").onClick(() => {
			this.resetDraft();
			this.render();
			this.syncApplyState();
		});
		new ButtonComponent(buttons)
			.setButtonText("Cancel")
			.onClick(() => this.close());
		this.applyButton = new ButtonComponent(buttons)
			.setButtonText("Apply")
			.setCta()
			.onClick(() => void this.apply());

		this.syncApplyState();
	}

	private trackValidity(key: string, valid: boolean): void {
		if (valid) this.invalidFields.delete(key);
		else this.invalidFields.add(key);
		this.syncApplyState();
	}

	private async apply(): Promise<void> {
		const patch = this.buildPatch();
		if (isEmptyPatch(patch) || this.invalidFields.size > 0) return;

		this.applyButton?.setDisabled(true);
		try {
			await this.options.onApply(patch);
		} catch (err) {
			// Keep the modal open with the draft intact: a failed save must stay
			// retryable, and the button must not latch disabled.
			console.error(err);
			const message =
				err instanceof Error && err.message
					? err.message
					: "Bulk edit failed — nothing may have been saved. Check the developer console.";
			new Notice(message);
			this.syncApplyState();
			return;
		}
		this.closeConfirmed = true;
		this.close();
	}
}
