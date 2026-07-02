import type { App } from "obsidian";
import type { AreaFile, AreaItem, FieldValue } from "../../types";
import {
	type AreaTagSuggest,
	getVaultTagSuggestions,
	renderAreaTagEditor,
} from "../TagInput";
import { getFileExtension } from "../area-gallery/imageFileTypes";
import {
	type SourceActionButtons,
	renderAttachmentActions,
	renderSourceActions,
	syncSourceActionState as syncSourceButtons,
} from "./actionButtons";
import { getFileName, getShortPath } from "./attachments";
import {
	renderCustomFieldInput,
	renderDetailSection,
	renderTextField,
} from "./fieldInputs";
import { extractPalette, renderPalette } from "./palette";

export interface DetailSidebarContext {
	app: App;
	// Live accessors: the sidebar reads schema/suggestions from the current area
	// and resolves the edited item fresh on every change, so an external reload
	// (which replaces the item objects) never routes an edit to orphaned data.
	getAreaData: () => AreaFile;
	getCurrentItem: () => AreaItem | null;
	onDataChanged: () => void;
	onTagsChanged: () => void;
}

/**
 * The right-hand "Details" panel: file specimen, palette, editable fields, tag
 * editor and file/source actions. Constructed once per view (so the vault-tag
 * scan runs once) and re-rendered for each item as the user pages ←/→; each
 * render tears down the previous item's transient state (tag suggester,
 * in-flight palette extraction).
 */
export class DetailSidebar {
	private sourceActionButtons: SourceActionButtons | null = null;
	private tagSuggest: AreaTagSuggest | null = null;
	// Bumped on every (re)render so a slow palette extraction from a previous
	// item can't paint over the current one.
	private renderToken = 0;
	private readonly vaultTagSuggestions: string[];

	constructor(private ctx: DetailSidebarContext) {
		this.vaultTagSuggestions = getVaultTagSuggestions(ctx.app);
	}

	render(container: HTMLElement): void {
		this.resetItemState();
		container.empty();
		const item = this.ctx.getCurrentItem();
		if (!item) return;

		const scroll = container.createDiv("area-detail-sidebar-scroll");
		this.renderSpecimen(scroll, item);
		this.renderPaletteRow(scroll, item);
		this.renderCoreFields(scroll, item);
		this.renderCustomFields(scroll, item);
		this.renderActions(container, item);
	}

	dispose(): void {
		this.resetItemState();
	}

	private renderSpecimen(scroll: HTMLElement, item: AreaItem): void {
		const specimen = scroll.createDiv("area-detail-specimen");
		specimen.createDiv({
			cls: "area-detail-format",
			text:
				getFileExtension(getFileName(item.vaultPath))?.toUpperCase() ?? "IMG",
		});
		const text = specimen.createDiv("area-detail-specimen-text");
		text.createDiv({
			cls: "area-detail-file-name",
			text: getFileName(item.vaultPath),
		});
		const path = text.createDiv({
			cls: "area-detail-file-path",
			text: getShortPath(item.vaultPath),
		});
		path.setAttribute("title", item.vaultPath);
	}

	private renderPaletteRow(scroll: HTMLElement, item: AreaItem): void {
		const host = scroll.createDiv(
			"area-detail-palette area-detail-palette--empty",
		);
		const token = this.renderToken;
		void extractPalette(this.ctx.app, item.vaultPath).then((colors) => {
			if (token !== this.renderToken) return;
			renderPalette(host, colors);
		});
	}

	private renderCoreFields(scroll: HTMLElement, item: AreaItem): void {
		const section = renderDetailSection(scroll, "Details", "info");
		renderTextField(
			section,
			"text",
			item.title ?? "",
			(val) => this.editItem((it) => (it.title = val.trim() || undefined)),
			"Title",
			"Untitled",
		);

		renderTextField(
			section,
			"url",
			item.sourceUrl ?? "",
			(val) => {
				this.editItem((it) => (it.sourceUrl = val.trim() || undefined));
				this.syncSourceActionState();
			},
			"Source URL",
			"https://…",
		);

		section.createDiv("area-detail-field", (field) => {
			field.createEl("label", { text: "Tags" });
			const wrap = field.createDiv("area-tag-editor-host");
			this.renderTagEditor(wrap, item.tags);
		});
	}

	private renderCustomFields(scroll: HTMLElement, item: AreaItem): void {
		const schema = this.ctx.getAreaData().schema;
		if (!schema || schema.length === 0) return;

		const section = renderDetailSection(scroll, "Fields", "layout-list");
		for (const fieldDef of schema) {
			const current = item.fields?.[fieldDef.id];
			section.createDiv("area-detail-field", (field) => {
				field.createEl("label", { text: fieldDef.label });
				renderCustomFieldInput(field, fieldDef, current, (val) =>
					this.editItem((it) => setCustomFieldValue(it, fieldDef.id, val)),
				);
			});
		}
	}

	private renderTagEditor(container: HTMLElement, tags: string[]): void {
		this.tagSuggest?.close();
		this.tagSuggest = renderAreaTagEditor({
			app: this.ctx.app,
			container,
			tags,
			getSuggestions: () => this.getAvailableTagSuggestions(),
			onChange: (next) => {
				const item = this.ctx.getCurrentItem();
				if (!item) return;
				item.tags = next;
				this.ctx.onDataChanged();
				this.ctx.onTagsChanged();
				this.renderTagEditor(container, next);
			},
		});
	}

	private getAvailableTagSuggestions(): string[] {
		const tags = new Set<string>(this.vaultTagSuggestions);
		for (const item of this.ctx.getAreaData().items) {
			for (const tag of item.tags) tags.add(tag);
		}
		return [...tags].sort((a, b) => a.localeCompare(b));
	}

	private renderActions(container: HTMLElement, item: AreaItem): void {
		const actions = container.createDiv("area-detail-actions");
		renderAttachmentActions(actions, this.ctx.app, item, () => {
			// No-op: opening an attachment shouldn't tear down the detail tab.
		});
		this.sourceActionButtons = renderSourceActions(actions, item);
	}

	// Resolve the edited item fresh (by id, via the live area) so a concurrent
	// external reload can't route the write to an orphaned object, then persist.
	private editItem(mutate: (item: AreaItem) => void): void {
		const item = this.ctx.getCurrentItem();
		if (!item) return;
		mutate(item);
		this.ctx.onDataChanged();
	}

	private syncSourceActionState(): void {
		const item = this.ctx.getCurrentItem();
		if (this.sourceActionButtons && item) {
			syncSourceButtons(item, this.sourceActionButtons);
		}
	}

	private resetItemState(): void {
		this.renderToken++;
		this.tagSuggest?.close();
		this.tagSuggest = null;
		this.sourceActionButtons = null;
	}
}

function setCustomFieldValue(
	item: AreaItem,
	fieldId: string,
	value: FieldValue | undefined,
): void {
	if (value === undefined || value === "") {
		if (item.fields) {
			delete item.fields[fieldId];
			if (Object.keys(item.fields).length === 0) delete item.fields;
		}
		return;
	}

	if (!item.fields) item.fields = {};
	item.fields[fieldId] = value;
}
