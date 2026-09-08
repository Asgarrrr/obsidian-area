import type { App } from "obsidian";
import { setCustomFieldValue } from "../../fieldValues";
import type { AreaFile, AreaItem } from "../../types";
import {
	type AreaTagSuggest,
	getVaultTagSuggestions,
	renderAreaTagEditor,
} from "../TagInput";
import { getFileExtension } from "../area-gallery/imageFileTypes";
import { getFileName } from "./attachments";
import {
	formatAddedAt,
	formatBytes,
	formatDimensions,
	readImageMeta,
} from "./fileMeta";
import {
	renderCustomFieldInput,
	renderDetailSection,
	renderTextField,
} from "./fieldInputs";
import { renderItemActions } from "./itemActions";
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
	private actionsEl: HTMLElement | null = null;
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

	// Imported images are named after a UUID, so the filename was pure noise in
	// the panel's most prominent slot. Dimensions, weight and date actually tell
	// you something; the full path stays available as a tooltip.
	private renderSpecimen(scroll: HTMLElement, item: AreaItem): void {
		const specimen = scroll.createDiv("area-detail-specimen");
		specimen.setAttribute("title", item.vaultPath);
		specimen.createDiv({
			cls: "area-detail-format",
			text:
				getFileExtension(getFileName(item.vaultPath))?.toUpperCase() ?? "IMG",
		});

		const text = specimen.createDiv("area-detail-specimen-text");
		const dimensionsEl = text.createDiv({
			cls: "area-detail-file-name",
			text: "—",
		});
		const detailEl = text.createDiv({ cls: "area-detail-file-path" });

		const added = formatAddedAt(item.addedAt);
		detailEl.setText(added ? `Added ${added}` : "");

		const token = this.renderToken;
		void readImageMeta(this.ctx.app, item.vaultPath).then((meta) => {
			if (token !== this.renderToken || !meta) return;
			dimensionsEl.setText(formatDimensions(meta));
			const weight = formatBytes(meta.size);
			detailEl.setText(added ? `${weight} · Added ${added}` : weight);
		});
	}

	private renderPaletteRow(scroll: HTMLElement, item: AreaItem): void {
		// Wrapped in a titled section like every other block, so the row of circles
		// is labelled rather than floating unexplained above the fields.
		const section = renderDetailSection(scroll, "Palette", "palette");
		section.addClass("area-detail-palette-section");
		section.addClass("area-detail-palette-section--empty");
		const host = section.createDiv(
			"area-detail-palette area-detail-palette--empty",
		);

		const token = this.renderToken;
		void extractPalette(this.ctx.app, item.vaultPath).then((colors) => {
			if (token !== this.renderToken) return;
			renderPalette(host, colors);
			section.toggleClass(
				"area-detail-palette-section--empty",
				colors.length === 0,
			);
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
		this.actionsEl = container.createDiv("area-detail-actions");
		renderItemActions(this.actionsEl, this.ctx.app, item);
	}

	// Resolve the edited item fresh (by id, via the live area) so a concurrent
	// external reload can't route the write to an orphaned object, then persist.
	private editItem(mutate: (item: AreaItem) => void): void {
		const item = this.ctx.getCurrentItem();
		if (!item) return;
		mutate(item);
		this.ctx.onDataChanged();
	}

	// Which action leads the footer depends on whether there's a usable source
	// URL, so typing one in reshuffles the bar rather than just relabelling it.
	private syncSourceActionState(): void {
		const item = this.ctx.getCurrentItem();
		if (this.actionsEl && item) {
			renderItemActions(this.actionsEl, this.ctx.app, item);
		}
	}

	private resetItemState(): void {
		this.renderToken++;
		this.tagSuggest?.close();
		this.tagSuggest = null;
		this.actionsEl = null;
	}
}
