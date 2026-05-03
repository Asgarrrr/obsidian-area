import { App, ButtonComponent, Modal, Notice } from "obsidian";
import type { AreaFile, AreaItem, FieldValue } from "../types";
import {
	type AreaTagSuggest,
	getVaultTagSuggestions,
	renderAreaTagEditor,
} from "./TagInput";
import {
	type SourceActionButtons,
	renderAttachmentActions,
	renderSourceActions,
	syncSourceActionState as syncSourceButtons,
} from "./item-detail/actionButtons";
import {
	getFileName,
	getShortPath,
} from "./item-detail/attachments";
import {
	renderCustomFieldInput,
	renderDetailSection,
	renderTextField,
} from "./item-detail/fieldInputs";

export class ItemDetailModal extends Modal {
	private deleteConfirmPending = false;
	private deleteConfirmTimer: number | null = null;
	private sourceActionButtons: SourceActionButtons | null = null;
	private tagSuggest: AreaTagSuggest | null = null;
	private vaultTagSuggestions: string[] = [];

	constructor(
		app: App,
		private item: AreaItem,
		private areaData: AreaFile,
		private onDataChanged: () => void,
		private onStructuralChange: () => void,
		private onTagsChanged: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.vaultTagSuggestions = getVaultTagSuggestions(this.app);
		this.modalEl.addClass("area-detail-modal-shell");

		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("area-detail-modal");

		const wrap = contentEl.createDiv("area-detail");
		this.renderPreview(wrap);

		const sidebar = wrap.createDiv("area-detail-sidebar");
		const scroll = sidebar.createDiv("area-detail-sidebar-scroll");
		this.renderCoreFields(scroll);
		this.renderCustomFields(scroll);
		this.renderActions(sidebar);
	}

	private renderPreview(container: HTMLElement): void {
		const preview = container.createDiv("area-detail-preview");
		const frame = preview.createDiv("area-detail-preview-frame");
		const img = frame.createEl("img");
		img.src = this.app.vault.adapter.getResourcePath(this.item.vaultPath);
		img.alt = this.item.title ?? "";

		const fileInfo = preview.createDiv("area-detail-file-info");
		const fileText = fileInfo.createDiv("area-detail-file-text");
		fileText.createDiv({
			cls: "area-detail-file-name",
			text: getFileName(this.item.vaultPath),
		});
		const pathEl = fileText.createDiv({
			cls: "area-detail-file-path",
			text: getShortPath(this.item.vaultPath),
		});
		pathEl.setAttribute("title", this.item.vaultPath);

		const actions = fileInfo.createDiv("area-detail-file-actions");
		renderAttachmentActions(actions, this.app, this.item, () => this.close());
	}

	private renderCoreFields(meta: HTMLElement): void {
		const section = renderDetailSection(meta, "Details");
		renderTextField(
			section,
			"Title",
			"text",
			this.item.title ?? "",
			(val) => {
				this.item.title = val || undefined;
				this.onDataChanged();
			},
		);

		renderTextField(
			section,
			"Source URL",
			"url",
			this.item.sourceUrl ?? "",
			(val) => {
				this.item.sourceUrl = val.trim() || undefined;
				this.onDataChanged();
				this.syncSourceActionState();
			},
		);

		section.createDiv("area-detail-field", (field) => {
			field.createEl("label", { text: "Tags" });
			const wrap = field.createDiv("area-tag-editor-host");
			this.renderTagEditor(wrap);
		});
	}

	private renderCustomFields(meta: HTMLElement): void {
		const schema = this.areaData.schema;
		if (!schema || schema.length === 0) return;

		const section = renderDetailSection(meta, "Fields");
		for (const fieldDef of schema) {
			const current = this.item.fields?.[fieldDef.id];
			section.createDiv("area-detail-field", (field) => {
				field.createEl("label", { text: fieldDef.label });
				renderCustomFieldInput(field, fieldDef, current, (val) => {
					this.setCustomFieldValue(fieldDef.id, val);
					this.onDataChanged();
				});
			});
		}
	}

	private renderTagEditor(container: HTMLElement): void {
		this.tagSuggest?.close();
		this.tagSuggest = renderAreaTagEditor({
			app: this.app,
			container,
			tags: this.item.tags,
			getSuggestions: () => this.getAvailableTagSuggestions(),
			onChange: (tags) => {
				this.item.tags = tags;
				this.onDataChanged();
				this.onTagsChanged();
				this.renderTagEditor(container);
			},
		});
	}

	private getAvailableTagSuggestions(): string[] {
		const tags = new Set<string>(this.vaultTagSuggestions);
		for (const item of this.areaData.items) {
			for (const tag of item.tags) {
				tags.add(tag);
			}
		}
		return [...tags].sort((a, b) => a.localeCompare(b));
	}

	private renderActions(meta: HTMLElement): void {
		const actions = meta.createDiv("area-detail-actions");
		const sourceActions = actions.createDiv("area-detail-action-group");
		this.sourceActionButtons = renderSourceActions(sourceActions, this.item);

		const destructiveActions = actions.createDiv("area-detail-action-group");
		const deleteButton = new ButtonComponent(destructiveActions)
			.setButtonText("Delete image")
			.setWarning()
			.onClick((evt) => {
				this.stopActionEvent(evt);
				this.handleDeleteClick(deleteButton);
			});
	}

	private syncSourceActionState(): void {
		if (this.sourceActionButtons) {
			syncSourceButtons(this.item, this.sourceActionButtons);
		}
	}

	private deleteItem(): void {
		const idx = this.areaData.items.findIndex((i) => i.id === this.item.id);
		if (idx !== -1) this.areaData.items.splice(idx, 1);
		this.onStructuralChange();
		this.close();
	}

	private handleDeleteClick(deleteButton: ButtonComponent): void {
		if (this.deleteConfirmPending) {
			this.deleteItem();
			return;
		}

		this.deleteConfirmPending = true;
		deleteButton.setButtonText("Confirm delete");
		deleteButton.setTooltip("Click again to remove it from this area");
		new Notice("Click again to delete. The attachment stays in your vault.");

		this.deleteConfirmTimer = window.setTimeout(() => {
			this.deleteConfirmPending = false;
			this.deleteConfirmTimer = null;
			deleteButton.setButtonText("Delete image");
			deleteButton.setTooltip("");
		}, 4000);
	}

	private setCustomFieldValue(
		fieldId: string,
		value: FieldValue | undefined,
	): void {
		if (value === undefined || value === "") {
			if (this.item.fields) {
				delete this.item.fields[fieldId];
				if (Object.keys(this.item.fields).length === 0) {
					delete this.item.fields;
				}
			}
			return;
		}

		if (!this.item.fields) this.item.fields = {};
		this.item.fields[fieldId] = value;
	}

	private stopActionEvent(evt: MouseEvent): void {
		evt.preventDefault();
		evt.stopPropagation();
	}

	onClose(): void {
		if (this.deleteConfirmTimer !== null) {
			window.clearTimeout(this.deleteConfirmTimer);
			this.deleteConfirmTimer = null;
		}
		this.tagSuggest?.close();
		this.tagSuggest = null;
		this.sourceActionButtons = null;
		this.modalEl.removeClass("area-detail-modal-shell");
		this.contentEl.empty();
	}
}
