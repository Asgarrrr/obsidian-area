import { ButtonComponent, DropdownComponent, SearchComponent } from "obsidian";
import type { AreaFile } from "../../types";
import { type Facet, buildFacets } from "./facets";
import { closeFacetMenu, isFacetMenuOpenFor, openFacetMenu } from "./facetMenu";
import {
	type SortOrder,
	getAllTags,
	getTagSignature,
	pruneActiveTagFilters,
} from "./filtering";

interface RenderAreaToolbarOptions {
	toolbar: HTMLElement;
	areaData: AreaFile;
	activeTagFilters: Set<string>;
	searchQuery: string;
	sortOrder: SortOrder;
	onConfigureFields: () => void;
	onImportFiles: () => void;
	onImportVaultImage: () => void;
	onSearchChange: (value: string) => void;
	onSortOrderChange: (sortOrder: SortOrder) => void;
	onTagFilterToggle: (tag: string) => void;
	onClearTagFilters: () => void;
}

export interface AreaToolbarHandle {
	tagSignature: string;
	// Called by the view once it knows how many items survived the filters.
	setCounts: (visible: number, total: number) => void;
}

const SORT_OPTIONS: ReadonlyArray<readonly [SortOrder, string]> = [
	["newest", "Newest first"],
	["oldest", "Oldest first"],
	["title-az", "Title A → Z"],
	["title-za", "Title Z → A"],
];

export function renderAreaToolbar({
	toolbar,
	areaData,
	activeTagFilters,
	searchQuery,
	sortOrder,
	onConfigureFields,
	onImportFiles,
	onImportVaultImage,
	onSearchChange,
	onSortOrderChange,
	onTagFilterToggle,
	onClearTagFilters,
}: RenderAreaToolbarOptions): AreaToolbarHandle {
	// The toolbar is about to be torn down — an open facet menu would outlive its
	// anchor and toggle filters nothing is listening to.
	closeFacetMenu();
	toolbar.empty();

	const left = toolbar.createDiv("area-toolbar-left");

	const searchWrap = left.createDiv("area-search-container");
	const search = new SearchComponent(searchWrap)
		.setPlaceholder("Search…")
		.setValue(searchQuery)
		.onChange(onSearchChange);
	search.inputEl.addClass("area-search");

	const allTags = getAllTags(areaData.items);
	pruneActiveTagFilters(activeTagFilters, allTags);
	const tagSignature = getTagSignature(allTags);

	renderFacetBar(left, {
		facets: buildFacets(areaData.items),
		activeTagFilters,
		onTagFilterToggle,
		onClearTagFilters,
	});

	const right = toolbar.createDiv("area-toolbar-right");
	const countEl = right.createDiv("area-toolbar-count");

	const sortSelect = new DropdownComponent(right);
	sortSelect.selectEl.addClass("area-sort-select");
	for (const [value, label] of SORT_OPTIONS) {
		sortSelect.addOption(value, label);
	}
	sortSelect.setValue(sortOrder).onChange((value) => {
		onSortOrderChange(value as SortOrder);
	});

	addIconButton(right, "image-plus", "Import image files", onImportFiles);
	addIconButton(
		right,
		"folder-open",
		"Add existing vault image",
		onImportVaultImage,
	);
	addIconButton(right, "settings-2", "Configure fields", onConfigureFields);

	return {
		tagSignature,
		setCounts: (visible, total) => setCounts(countEl, visible, total),
	};
}

interface FacetBarOptions {
	facets: Facet[];
	activeTagFilters: Set<string>;
	onTagFilterToggle: (tag: string) => void;
	onClearTagFilters: () => void;
}

function renderFacetBar(
	container: HTMLElement,
	{
		facets,
		activeTagFilters,
		onTagFilterToggle,
		onClearTagFilters,
	}: FacetBarOptions,
): void {
	const bar = container.createDiv("area-facets");
	const syncCallbacks: Array<() => void> = [];

	function syncClearVisibility(): void {
		clearButton.buttonEl.toggleClass(
			"area-facet-clear--hidden",
			activeTagFilters.size === 0,
		);
	}

	for (const facet of facets) {
		syncCallbacks.push(
			renderFacetButton(bar, facet, activeTagFilters, (tag) => {
				onTagFilterToggle(tag);
				syncClearVisibility();
			}),
		);
	}

	const clearButton = new ButtonComponent(bar)
		.setButtonText("Clear")
		.setTooltip("Clear tag filters")
		.onClick(() => {
			onClearTagFilters();
			for (const sync of syncCallbacks) sync();
			syncClearVisibility();
		});
	clearButton.buttonEl.addClass("area-facet-clear");

	syncClearVisibility();
}

// Returns a callback that re-reads the active set and repaints the badge, so an
// external clear can refresh the button without rebuilding the toolbar.
function renderFacetButton(
	bar: HTMLElement,
	facet: Facet,
	activeTagFilters: Set<string>,
	onTagFilterToggle: (tag: string) => void,
): () => void {
	const button = new ButtonComponent(bar)
		.setButtonText(facet.label)
		.setTooltip(`Filter by ${facet.label.toLowerCase()}`);
	const buttonEl = button.buttonEl;
	buttonEl.addClass("area-facet-button");
	buttonEl.setAttribute("aria-haspopup", "true");
	buttonEl.setAttribute("aria-expanded", "false");

	const badge = buttonEl.createSpan("area-facet-badge");

	const sync = (): void => {
		const active = facet.values.filter((value) =>
			activeTagFilters.has(value.tag),
		).length;
		buttonEl.classList.toggle("is-active", active > 0);
		badge.setText(active > 0 ? String(active) : "");
		badge.toggleClass("area-facet-badge--hidden", active === 0);
	};

	button.onClick(() => {
		// Second click on the open menu's own button dismisses it; the outside
		// handler deliberately ignores the anchor so this stays a toggle.
		if (isFacetMenuOpenFor(buttonEl)) {
			closeFacetMenu();
			buttonEl.setAttribute("aria-expanded", "false");
			return;
		}

		openFacetMenu({
			anchor: buttonEl,
			facet,
			isActive: (tag) => activeTagFilters.has(tag),
			onToggle: (tag) => {
				onTagFilterToggle(tag);
				sync();
			},
		});
		buttonEl.setAttribute("aria-expanded", "true");
	});

	sync();
	return sync;
}

function setCounts(countEl: HTMLElement, visible: number, total: number): void {
	if (total === 0) {
		countEl.setText("");
		return;
	}

	countEl.setText(
		visible === total ? `${total} items` : `${visible} / ${total}`,
	);
}

function addIconButton(
	container: HTMLElement,
	icon: string,
	label: string,
	onClick: () => void,
): void {
	const button = new ButtonComponent(container)
		.setIcon(icon)
		.setTooltip(label)
		.onClick(onClick);
	button.buttonEl.setAttribute("aria-label", label);
}
