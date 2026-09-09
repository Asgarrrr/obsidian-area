import { ButtonComponent, DropdownComponent, SearchComponent } from "obsidian";
import type { AreaFile } from "../../types";
import { type FacetBinding, renderFacetBar } from "./facetBar";
import { closeFacetMenu } from "./facetMenu";
import { buildFacets } from "./facets";
import {
	buildFieldFacets,
	getFieldFacetSignature,
	pruneActiveFieldValues,
} from "./fieldFacets";
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
	// Selected values per schema field id — the field equivalent of the tag set.
	activeFieldValues: Map<string, Set<string>>;
	searchQuery: string;
	sortOrder: SortOrder;
	onConfigureFields: () => void;
	onImportFiles: () => void;
	onImportVaultImage: () => void;
	onSearchChange: (value: string) => void;
	onSortOrderChange: (sortOrder: SortOrder) => void;
	onTagFilterToggle: (tag: string) => void;
	onFieldValueToggle: (fieldId: string, value: string) => void;
	onClearAllFilters: () => void;
}

export interface AreaToolbarHandle {
	tagSignature: string;
	fieldSignature: string;
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
	activeFieldValues,
	searchQuery,
	sortOrder,
	onConfigureFields,
	onImportFiles,
	onImportVaultImage,
	onSearchChange,
	onSortOrderChange,
	onTagFilterToggle,
	onFieldValueToggle,
	onClearAllFilters,
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

	const fieldFacets = buildFieldFacets(areaData.items, areaData.schema);
	pruneActiveFieldValues(activeFieldValues, fieldFacets);
	const fieldSignature = getFieldFacetSignature(fieldFacets);

	const bindings: FacetBinding[] = [
		...buildFacets(areaData.items).map((facet) => ({
			facet,
			isActive: (tag: string) => activeTagFilters.has(tag),
			onToggle: onTagFilterToggle,
		})),
		...fieldFacets.map((facet) => ({
			facet,
			kind: "field" as const,
			isActive: (value: string) =>
				activeFieldValues.get(facet.key)?.has(value) ?? false,
			onToggle: (value: string) => onFieldValueToggle(facet.key, value),
		})),
	];

	renderFacetBar(left, {
		bindings,
		hasActiveFilters: () =>
			activeTagFilters.size > 0 || activeFieldValues.size > 0,
		onClearAll: onClearAllFilters,
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
		fieldSignature,
		setCounts: (visible, total) => setCounts(countEl, visible, total),
	};
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
