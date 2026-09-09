import { Notice, TextFileView, type WorkspaceLeaf } from "obsidian";
import { parseAreaFile } from "../areaFile";
import { VIEW_TYPE_AREA } from "../constants";
import type AreaPlugin from "../main";
import type { AreaFile, AreaItem } from "../types";
import { renderAreaCard } from "./area-gallery/card";
import { renderEmptyState } from "./area-gallery/emptyState";
import { GalleryToolbarController } from "./area-gallery/galleryToolbar";
import { AreaImportController } from "./area-gallery/importController";
import { MasonryController } from "./area-gallery/masonry";
import { SelectionController } from "./area-gallery/selectionController";

export class AreaGalleryView extends TextFileView {
	private areaData: AreaFile = { version: "1", name: "", items: [] };
	private gridEl: HTMLElement | null = null;
	private masonry = new MasonryController();
	private imports: AreaImportController;
	private toolbar: GalleryToolbarController;
	private selection: SelectionController;
	// Set to the original bytes when a file can't be parsed, so getViewData can
	// round-trip them verbatim instead of overwriting a recoverable file.
	private unreadableData: string | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: AreaPlugin,
	) {
		super(leaf);
		this.imports = new AreaImportController(this, plugin);
		this.toolbar = new GalleryToolbarController(this, plugin);
		this.selection = new SelectionController(this, plugin);
	}

	onload(): void {
		this.contentEl.addClass("area-view");
		this.register(() => this.masonry.destroy());
		this.register(() => this.toolbar.dispose());
		this.imports.register();
	}

	getViewType(): string {
		return VIEW_TYPE_AREA;
	}

	getDisplayText(): string {
		return this.areaData.name || "Area";
	}

	getIcon(): string {
		return "layout-grid";
	}

	getViewData(): string {
		// If the file couldn't be read, hand back its original bytes so a save
		// never clobbers a recoverable file with empty/stale data.
		if (this.unreadableData !== null) return this.unreadableData;
		return JSON.stringify(this.areaData, null, 2);
	}

	setViewData(data: string, _clear: boolean): void {
		try {
			this.areaData = parseAreaFile(data);
			this.unreadableData = null;
		} catch {
			this.unreadableData = data;
			this.areaData = { version: "1", name: "", items: [] };
			new Notice("Area: couldn't read this file — it won't be modified.");
		}
		this.render();
	}

	clear(): void {
		this.areaData = { version: "1", name: "", items: [] };
		this.unreadableData = null;
		this.render();
	}

	render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("area-view");

		if (this.unreadableData !== null) {
			this.renderUnreadableState();
			return;
		}

		const toolbarEl = this.contentEl.createDiv("area-toolbar");
		const bulkBarEl = this.contentEl.createDiv();
		this.gridEl = this.contentEl.createDiv("area-grid");
		this.gridEl.dataset.cardSize = this.plugin.settings.cardSize;
		this.toolbar.render(toolbarEl);
		this.selection.render(bulkBarEl);
		this.renderGrid();
	}

	private renderUnreadableState(): void {
		// Stop watching the now-detached grid and drop the stale element ref.
		this.masonry.disconnect();
		this.gridEl = null;
		// No bulk bar is rendered on this branch, so the selection has no way back
		// on screen and no items to act on.
		this.selection.reset();
		const container = this.contentEl.createDiv("area-grid area-grid--empty");
		renderEmptyState({ container, kind: "unreadable" });
	}

	// Called only from the settings size-change path: card size alters the
	// column width without resizing the grid, so the observer won't fire — relayout.
	refreshCardSize(): void {
		if (this.gridEl) {
			this.gridEl.dataset.cardSize = this.plugin.settings.cardSize;
			this.masonry.relayout();
		}
	}

	private renderGrid(): void {
		const grid = this.gridEl;
		if (!grid) return;

		grid.empty();

		// An import, or a delete from the detail view, can strip an id the
		// selection still holds — drop those before anything reads it back.
		this.selection.prune(this.areaData.items);

		const items = this.toolbar.getVisibleItems(this.areaData.items);
		this.toolbar.updateCounts(items.length, this.areaData.items.length);
		this.toolbar.syncSavedViewSelection();
		this.selection.syncCounts(items);

		if (items.length === 0) {
			// No cards to lay out — stop the observer watching this grid so it
			// doesn't leak once the next render rebuilds the element.
			this.masonry.disconnect();
			grid.addClass("area-grid--empty");
			const kind = this.areaData.items.length === 0 ? "empty" : "no-results";
			renderEmptyState({
				container: grid,
				kind,
				onClearFilters:
					kind === "no-results"
						? () => {
								this.toolbar.clearFilters();
								this.renderGrid();
							}
						: undefined,
			});
			return;
		}

		grid.removeClass("area-grid--empty");

		const areaPath = this.file?.path ?? "";
		const showTitle = this.plugin.settings.showCardTitles;
		items.forEach((item, index) => {
			renderAreaCard({
				app: this.plugin.app,
				grid,
				item,
				areaPath,
				siblings: items,
				index,
				showTitle,
				selected: this.selection.isSelected(item.id),
				onToggleSelection: (id) => this.selection.toggle(id),
			});
		});

		this.masonry.observe(grid);
	}

	private refreshTagsAndGrid(): void {
		this.toolbar.refreshIfTagsChanged(this.areaData.items);
		this.renderGrid();
	}

	// Accessors + delegators the masonry/import/toolbar controllers call back on.
	rerenderGrid(): void {
		this.renderGrid();
	}

	getAreaData(): AreaFile {
		return this.areaData;
	}

	getItems(): AreaItem[] {
		return this.areaData.items;
	}

	// False while the file couldn't be parsed — blocks imports so they don't
	// write orphan attachments or silently vanish on save.
	canModify(): boolean {
		return this.unreadableData === null;
	}

	// Gates the document-level paste handler (activeLeaf is deprecated).
	isActiveView(): boolean {
		return this.app.workspace.getActiveViewOfType(AreaGalleryView) === this;
	}

	notifyItemsChanged(): void {
		this.refreshTagsAndGrid();
	}

	openExternalImagePicker(): void {
		this.imports.openExternalImagePicker();
	}

	openVaultImagePicker(): void {
		this.imports.openVaultImagePicker();
	}
}
