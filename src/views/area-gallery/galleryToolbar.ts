import type AreaPlugin from "../../main";
import type { AreaItem, AreaSortState } from "../../types";
import type { AreaGalleryView } from "../AreaGalleryView";
import { SchemaEditorModal } from "../SchemaEditorModal";
import { closeFacetMenu } from "./facetMenu";
import {
	buildFieldFacets,
	getFieldFacetSignature,
	toFieldFilters,
	toggleFieldValue,
} from "./fieldFacets";
import {
	getAllTags,
	getFilteredItems,
	getTagSignature,
	pruneActiveTagFilters,
} from "./filtering";
import type { ToolbarFilterState } from "./savedViews";
import { SavedViewsController } from "./savedViewsController";
import { type AreaToolbarHandle, renderAreaToolbar } from "./toolbar";

const SEARCH_DEBOUNCE_MS = 120;

// Owns the search / sort / tag- and field-filter state and the toolbar
// rendering. The view asks it for the visible item list and lets it drive grid
// re-renders.
export class GalleryToolbarController {
	private activeTagFilters = new Set<string>();
	// Selected values per schema field id. Values inside one field are
	// alternatives; separate fields intersect — same rule as the tag facets.
	private activeFieldValues = new Map<string, Set<string>>();
	private searchQuery = "";
	private sort: AreaSortState = { type: "newest" };
	private renderedTagSignature = "";
	private renderedFieldSignature = "";
	private searchRenderTimer: number | undefined;
	private toolbarEl: HTMLElement | null = null;
	private handle: AreaToolbarHandle | null = null;
	private savedViews: SavedViewsController;

	constructor(
		private view: AreaGalleryView,
		private plugin: AreaPlugin,
	) {
		this.savedViews = new SavedViewsController(plugin.app, view, {
			capture: () => this.captureState(),
			restore: (state) => this.restoreState(state),
			refresh: () => {
				this.renderToolbar();
				this.view.rerenderGrid();
			},
		});
	}

	// The filters as they stand, in the shape a saved view is captured from.
	private captureState(): ToolbarFilterState {
		return {
			searchQuery: this.searchQuery,
			activeTagFilters: this.activeTagFilters,
			activeFieldValues: this.activeFieldValues,
			sort: this.sort,
		};
	}

	private restoreState(state: ToolbarFilterState): void {
		this.searchQuery = state.searchQuery;
		this.activeTagFilters = state.activeTagFilters;
		this.activeFieldValues = state.activeFieldValues;
		this.sort = state.sort;
		this.renderToolbar();
		this.view.rerenderGrid();
	}

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
			sort: this.sort,
			fieldFilters: toFieldFilters(this.activeFieldValues),
			schema: this.view.getAreaData().schema,
		});
	}

	// After an import or a tag/field edit, re-render the toolbar if the available
	// values changed. renderAreaToolbar prunes selections that no longer exist,
	// so a stale button can't survive the pass.
	refreshIfTagsChanged(items: AreaItem[]): void {
		const allTags = getAllTags(items);
		const nextTagSignature = getTagSignature(allTags);
		const nextFieldSignature = getFieldFacetSignature(
			buildFieldFacets(items, this.view.getAreaData().schema),
		);
		const didPrune = pruneActiveTagFilters(this.activeTagFilters, allTags);

		if (
			nextTagSignature !== this.renderedTagSignature ||
			nextFieldSignature !== this.renderedFieldSignature ||
			didPrune
		) {
			this.renderToolbar();
		}
	}

	clearFilters(): void {
		this.activeTagFilters.clear();
		this.activeFieldValues.clear();
		this.searchQuery = "";
		this.renderToolbar();
	}

	// Re-reads whether the live filters still match the selected view. Called on
	// every grid render, since a facet click changes the filters without
	// rebuilding the toolbar.
	syncSavedViewSelection(): void {
		this.handle?.setActiveView(this.savedViews.getActiveId());
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
			activeFieldValues: this.activeFieldValues,
			searchQuery: this.searchQuery,
			sort: this.sort,
			savedViews: this.savedViews.getViews(),
			activeViewId: this.savedViews.getActiveId(),
			canModify: this.view.canModify(),
			savedViewActions: {
				hasManagedView: () => this.savedViews.hasManagedView(),
				onSelect: (id) => this.savedViews.select(id),
				onSaveAsNew: () => this.savedViews.saveAsNew(),
				onUpdateActive: () => this.savedViews.updateActive(),
				onRenameActive: () => this.savedViews.renameActive(),
				onDeleteActive: () => this.savedViews.deleteActive(),
			},
			onConfigureFields: () => {
				new SchemaEditorModal(this.plugin.app, this.view.getAreaData(), () => {
					this.view.requestSave();
					// The sort dropdown and the field facets are both derived from the
					// schema, so an edit has to rebuild the toolbar — unconditionally,
					// since a field added before anything fills it shifts no signature.
					// Rendering also prunes selections on a field that just went away;
					// the grid then has to follow, or it keeps showing that subset.
					this.renderToolbar();
					this.view.rerenderGrid();
				}).open();
			},
			onImportFiles: () => this.view.openExternalImagePicker(),
			onImportVaultImage: () => this.view.openVaultImagePicker(),
			onSearchChange: (value) => {
				this.searchQuery = value.toLowerCase().trim();
				this.queueGridRender();
			},
			onSortChange: (sort) => {
				this.sort = sort;
				this.view.rerenderGrid();
			},
			onTagFilterToggle: (tag) => {
				if (this.activeTagFilters.has(tag)) this.activeTagFilters.delete(tag);
				else this.activeTagFilters.add(tag);
				this.view.rerenderGrid();
			},
			onFieldValueToggle: (fieldId, value) => {
				const values = this.activeFieldValues.get(fieldId) ?? new Set<string>();
				toggleFieldValue(values, value);
				// An empty set would keep the field in the map and read as an active
				// filter matching nothing.
				if (values.size === 0) this.activeFieldValues.delete(fieldId);
				else this.activeFieldValues.set(fieldId, values);
				this.view.rerenderGrid();
			},
			// Distinct from clearFilters(): the facet bar clears its own buttons in
			// place, so re-rendering the toolbar here would destroy the open menu.
			onClearAllFilters: () => {
				this.activeTagFilters.clear();
				this.activeFieldValues.clear();
				this.view.rerenderGrid();
			},
		});

		this.renderedTagSignature = this.handle.tagSignature;
		this.renderedFieldSignature = this.handle.fieldSignature;
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
