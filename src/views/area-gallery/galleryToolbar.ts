import type AreaPlugin from "../../main";
import type { AreaItem } from "../../types";
import type { AreaGalleryView } from "../AreaGalleryView";
import { SchemaEditorModal } from "../SchemaEditorModal";
import { closeFacetMenu } from "./facetMenu";
import {
	type SortOrder,
	getAllTags,
	getFilteredItems,
	getTagSignature,
	pruneActiveTagFilters,
} from "./filtering";
import { type AreaToolbarHandle, renderAreaToolbar } from "./toolbar";

const SEARCH_DEBOUNCE_MS = 120;

// Owns the search / sort / tag-filter state and the toolbar rendering. The view
// asks it for the visible item list and lets it drive grid re-renders.
export class GalleryToolbarController {
	private activeTagFilters = new Set<string>();
	private searchQuery = "";
	private sortOrder: SortOrder = "newest";
	private renderedTagSignature = "";
	private searchRenderTimer: number | undefined;
	private toolbarEl: HTMLElement | null = null;
	private handle: AreaToolbarHandle | null = null;

	constructor(
		private view: AreaGalleryView,
		private plugin: AreaPlugin,
	) {}

	// Bind to the toolbar element created on each full render.
	render(toolbarEl: HTMLElement): void {
		this.toolbarEl = toolbarEl;
		this.renderToolbar();
	}

	// Items filtered + sorted by the current toolbar state.
	getVisibleItems(items: AreaItem[]): AreaItem[] {
		return getFilteredItems(items, {
			activeTagFilters: this.activeTagFilters,
			searchQuery: this.searchQuery,
			sortOrder: this.sortOrder,
		});
	}

	// After an import or tag edit, re-render the toolbar if the available tag set
	// changed; prunes active filters whose tag no longer exists.
	refreshIfTagsChanged(items: AreaItem[]): void {
		const allTags = getAllTags(items);
		const nextSignature = getTagSignature(allTags);
		const didPrune = pruneActiveTagFilters(this.activeTagFilters, allTags);
		if (nextSignature !== this.renderedTagSignature || didPrune) {
			this.renderToolbar();
		}
	}

	clearFilters(): void {
		this.activeTagFilters.clear();
		this.searchQuery = "";
		this.renderToolbar();
	}

	// Report how much of the board survived the filters. Pushed through a handle
	// rather than a toolbar re-render so it can't tear down an open facet menu.
	updateCounts(visible: number, total: number): void {
		this.handle?.setCounts(visible, total);
	}

	dispose(): void {
		closeFacetMenu();
		if (this.searchRenderTimer !== undefined) {
			window.clearTimeout(this.searchRenderTimer);
			this.searchRenderTimer = undefined;
		}
	}

	private renderToolbar(): void {
		const toolbar = this.toolbarEl;
		if (!toolbar) return;

		this.handle = renderAreaToolbar({
			toolbar,
			areaData: this.view.getAreaData(),
			activeTagFilters: this.activeTagFilters,
			searchQuery: this.searchQuery,
			sortOrder: this.sortOrder,
			onConfigureFields: () => {
				new SchemaEditorModal(this.plugin.app, this.view.getAreaData(), () =>
					this.view.requestSave(),
				).open();
			},
			onImportFiles: () => this.view.openExternalImagePicker(),
			onImportVaultImage: () => this.view.openVaultImagePicker(),
			onSearchChange: (value) => {
				this.searchQuery = value.toLowerCase().trim();
				this.queueGridRender();
			},
			onSortOrderChange: (order) => {
				this.sortOrder = order;
				this.view.rerenderGrid();
			},
			onTagFilterToggle: (tag) => {
				if (this.activeTagFilters.has(tag)) this.activeTagFilters.delete(tag);
				else this.activeTagFilters.add(tag);
				this.view.rerenderGrid();
			},
			// Distinct from clearFilters(): the facet bar clears its own buttons in
			// place, so re-rendering the toolbar here would destroy the open menu.
			onClearTagFilters: () => {
				this.activeTagFilters.clear();
				this.view.rerenderGrid();
			},
		});

		this.renderedTagSignature = this.handle.tagSignature;
	}

	private queueGridRender(): void {
		if (this.searchRenderTimer !== undefined) {
			window.clearTimeout(this.searchRenderTimer);
		}
		this.searchRenderTimer = window.setTimeout(() => {
			this.searchRenderTimer = undefined;
			this.view.rerenderGrid();
		}, SEARCH_DEBOUNCE_MS);
	}
}
