import { Notice, TextFileView, type TFile, type WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_AREA } from "../constants";
import type AreaPlugin from "../main";
import type { AreaFile, AreaItem } from "../types";
import { SchemaEditorModal } from "./SchemaEditorModal";
import { renderAreaCard } from "./area-gallery/card";
import { getClipboardImageFiles } from "./area-gallery/clipboard";
import {
	type SortOrder,
	getAllTags,
	getFilteredItems,
	getTagSignature,
	pruneActiveTagFilters,
} from "./area-gallery/filtering";
import {
	hasAreaItemWithVaultPath,
	importImageFiles,
	importVaultImageFiles,
	type ImportImageResult,
} from "./area-gallery/importImages";
import { showImportImageResultNotice } from "./area-gallery/importNotices";
import { renderAreaToolbar } from "./area-gallery/toolbar";
import { openVaultImageSuggest } from "./area-gallery/vaultImageSuggest";

const SEARCH_DEBOUNCE_MS = 120;

export class AreaGalleryView extends TextFileView {
	private areaData: AreaFile = { version: "1", name: "", items: [] };
	private activeTagFilters: Set<string> = new Set();
	private dragDepth = 0;
	private gridEl: HTMLElement | null = null;
	private renderedTagSignature = "";
	private searchQuery = "";
	private searchRenderTimer: number | undefined;
	private sortOrder: SortOrder = "newest";
	private toolbarEl: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: AreaPlugin,
	) {
		super(leaf);
	}

	onload(): void {
		this.contentEl.addClass("area-view");
		this.registerDragAndDrop();
		this.registerPaste();
	}

	onunload(): void {
		if (this.searchRenderTimer !== undefined) {
			window.clearTimeout(this.searchRenderTimer);
			this.searchRenderTimer = undefined;
		}
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
		return JSON.stringify(this.areaData, null, 2);
	}

	setViewData(data: string, _clear: boolean): void {
		try {
			this.areaData = JSON.parse(data) as AreaFile;
		} catch {
			new Notice("Area: could not parse file");
		}
		this.render();
	}

	clear(): void {
		this.areaData = { version: "1", name: "", items: [] };
		this.render();
	}

	render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("area-view");

		this.renderShell();
		this.renderToolbar();
		this.renderGrid();
	}

	refreshCardSize(): void {
		if (this.gridEl) {
			this.gridEl.dataset.cardSize = this.plugin.settings.cardSize;
		}
	}

	private renderShell(): void {
		this.toolbarEl = this.contentEl.createDiv("area-toolbar");
		this.gridEl = this.contentEl.createDiv("area-grid");
		this.refreshCardSize();
	}

	private renderToolbar(): void {
		const toolbar = this.toolbarEl;
		if (!toolbar) return;

		this.renderedTagSignature = renderAreaToolbar({
			toolbar,
			areaData: this.areaData,
			activeTagFilters: this.activeTagFilters,
			searchQuery: this.searchQuery,
			sortOrder: this.sortOrder,
			onConfigureFields: () => {
				new SchemaEditorModal(this.plugin.app, this.areaData, () =>
					this.requestSave(),
				).open();
			},
			onImportFiles: () => this.openExternalImagePicker(),
			onImportVaultImage: () => this.openVaultImagePicker(),
			onSearchChange: (value) => {
				this.searchQuery = value.toLowerCase().trim();
				this.queueGridRender();
			},
			onSortOrderChange: (sortOrder) => {
				this.sortOrder = sortOrder;
				this.renderGrid();
			},
			onTagFilterToggle: (tag) => {
				this.activeTagFilters.has(tag)
					? this.activeTagFilters.delete(tag)
					: this.activeTagFilters.add(tag);
				this.renderGrid();
			},
		});
	}

	private renderGrid(): void {
		const grid = this.gridEl;
		if (!grid) return;

		grid.empty();
		this.refreshCardSize();

		for (const item of getFilteredItems(this.areaData.items, {
			activeTagFilters: this.activeTagFilters,
			searchQuery: this.searchQuery,
			sortOrder: this.sortOrder,
		})) {
			renderAreaCard({
				app: this.plugin.app,
				areaData: this.areaData,
				grid,
				item,
				onDataChanged: () => this.requestSave(),
				onStructuralChange: () => {
					this.requestSave();
					this.refreshTagsAndGrid();
				},
				onTagsChanged: () => this.refreshTagsAndGrid(),
			});
		}
	}

	private queueGridRender(): void {
		if (this.searchRenderTimer !== undefined) {
			window.clearTimeout(this.searchRenderTimer);
		}

		this.searchRenderTimer = window.setTimeout(() => {
			this.searchRenderTimer = undefined;
			this.renderGrid();
		}, SEARCH_DEBOUNCE_MS);
	}

	private refreshTagsAndGrid(): void {
		this.refreshToolbarIfTagsChanged();
		this.renderGrid();
	}

	private refreshToolbarIfTagsChanged(): void {
		const allTags = getAllTags(this.areaData.items);
		const nextTagSignature = getTagSignature(allTags);
		const didPruneActiveFilters = pruneActiveTagFilters(
			this.activeTagFilters,
			allTags,
		);

		if (
			nextTagSignature !== this.renderedTagSignature ||
			didPruneActiveFilters
		) {
			this.renderToolbar();
		}
	}

	private registerDragAndDrop(): void {
		this.registerDomEvent(this.contentEl, "dragenter", (e: DragEvent) => {
			if (!hasFileTransfer(e)) return;
			e.preventDefault();
			this.dragDepth++;
			this.contentEl.addClass("area-is-dragging");
		});

		this.registerDomEvent(this.contentEl, "dragover", (e: DragEvent) => {
			if (!hasFileTransfer(e)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
		});

		this.registerDomEvent(this.contentEl, "dragleave", (e: DragEvent) => {
			if (!hasFileTransfer(e)) return;
			this.dragDepth = Math.max(0, this.dragDepth - 1);
			if (this.dragDepth === 0) {
				this.contentEl.removeClass("area-is-dragging");
			}
		});

		this.registerDomEvent(this.contentEl, "drop", async (e: DragEvent) => {
			if (!hasFileTransfer(e)) return;
			e.preventDefault();
			this.clearDragState();

			const files = Array.from(e.dataTransfer?.files ?? []);
			if (files.length === 0) return;
			await this.importFiles(files);
		});
	}

	private registerPaste(): void {
		this.registerDomEvent(this.contentEl, "paste", async (e: ClipboardEvent) => {
			const files = getClipboardImageFiles(e);
			if (files.length === 0) {
				if (!isEditableTarget(e.target)) {
					new Notice("Area: clipboard has no images.");
				}
				return;
			}

			e.preventDefault();
			await this.importFiles(files);
		});
	}

	private clearDragState(): void {
		this.dragDepth = 0;
		this.contentEl.removeClass("area-is-dragging");
	}

	async addItem(item: AreaItem): Promise<void> {
		this.areaData.items.unshift(item);
		this.requestSave();
		this.refreshTagsAndGrid();
	}

	openExternalImagePicker(): void {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		input.multiple = true;
		input.style.display = "none";
		document.body.appendChild(input);

		const cleanup = () => {
			if (document.body.contains(input)) {
				document.body.removeChild(input);
			}
		};

		this.registerDomEvent(input, "change", async () => {
			const files = Array.from(input.files ?? []);
			cleanup();
			if (files.length > 0) {
				await this.importFiles(files);
			}
		});

		this.registerDomEvent(
			window,
			"focus",
			() => {
				window.setTimeout(cleanup, 300);
			},
			{ once: true },
		);

		input.click();
	}

	openVaultImagePicker(): void {
		openVaultImageSuggest(this.plugin.app, (file) => {
			this.importVaultFiles([file]);
		});
	}

	async importFiles(files: File[]): Promise<void> {
		const result = await importImageFiles(
			this.plugin.app,
			this.plugin.settings.attachmentsDir,
			files,
			this.areaData.items,
		);
		this.applyImportResult(result);
	}

	importVaultFiles(files: TFile[]): void {
		const result = importVaultImageFiles(files, this.areaData.items);
		this.applyImportResult(result);
	}

	private applyImportResult(result: ImportImageResult): void {
		const itemsToAdd: AreaItem[] = [];
		const skippedDuplicates = [...result.skippedDuplicates];

		for (const item of result.items) {
			if (
				hasAreaItemWithVaultPath(this.areaData.items, item.vaultPath) ||
				hasAreaItemWithVaultPath(itemsToAdd, item.vaultPath)
			) {
				skippedDuplicates.push({
					name: item.title ?? item.vaultPath,
					vaultPath: item.vaultPath,
				});
				continue;
			}

			itemsToAdd.push(item);
		}

		if (itemsToAdd.length > 0) {
			this.areaData.items.unshift(...itemsToAdd);
			this.requestSave();
			this.refreshTagsAndGrid();
		}

		showImportImageResultNotice({
			...result,
			items: itemsToAdd,
			skippedDuplicates,
		});
	}
}

function hasFileTransfer(event: DragEvent): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.closest("input, textarea, [contenteditable='true']") !== null;
}
