import { ButtonComponent, DropdownComponent, SearchComponent } from "obsidian";
import type { AreaFile, AreaSavedView, AreaSortState } from "../../types";
import { type FacetBinding, renderFacetBar } from "./facetBar";
import { closeFacetMenu } from "./facetMenu";
import { buildFacets } from "./facets";
import {
	buildFieldFacets,
	getFieldFacetSignature,
	pruneActiveFieldValues,
} from "./fieldFacets";
import { getAllTags, getTagSignature, pruneActiveTagFilters } from "./filtering";
import {
	renderSavedViewsBar,
	type SavedViewsBarOptions,
} from "./savedViewsBar";
import { buildSortOptions, decodeSortState, encodeSortState } from "./sortState";

interface RenderAreaToolbarOptions {
	toolbar: HTMLElement;
	areaData: AreaFile;
	activeTagFilters: Set<string>;
	// Selected values per schema field id — the field equivalent of the tag set.
	activeFieldValues: Map<string, Set<string>>;
	searchQuery: string;
	sort: AreaSortState;
	savedViews: AreaSavedView[];
	activeViewId: string | null;
	canModify: boolean;
	savedViewActions: Pick<
		SavedViewsBarOptions,
		| "onSelect"
		| "onSaveAsNew"
		| "onUpdateActive"
		| "onRenameActive"
		| "onDeleteActive"
	>;
	onConfigureFields: () => void;
	onImportFiles: () => void;
	onImportVaultImage: () => void;
	onSearchChange: (value: string) => void;
	onSortChange: (sort: AreaSortState) => void;
	onTagFilterToggle: (tag: string) => void;
	onFieldValueToggle: (fieldId: string, value: string) => void;
	onClearAllFilters: () => void;
}

export interface AreaToolbarHandle {
	tagSignature: string;
	fieldSignature: string;
	setActiveView: (id: string | null) => void;
	// Called by the view once it knows how many items survived the filters.
	setCounts: (visible: number, total: number) => void;
}

export function renderAreaToolbar({
	toolbar,
	areaData,
	activeTagFilters,
	activeFieldValues,
	searchQuery,
	sort,
	savedViews,
	activeViewId,
	canModify,
	savedViewActions,
	onConfigureFields,
	onImportFiles,
	onImportVaultImage,
	onSearchChange,
	onSortChange,
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

	const savedViewsHandle = renderSavedViewsBar({
		container: right,
		views: savedViews,
		activeViewId,
		canModify,
		...savedViewActions,
	});

	const sortSelect = new DropdownComponent(right);
	sortSelect.selectEl.addClass("area-sort-select");
	for (const [value, label] of buildSortOptions(areaData.schema)) {
		sortSelect.addOption(value, label);
	}
	// A sort naming a field the schema dropped has no option to select; falling
	// back keeps the control from showing a blank value.
	const encoded = encodeSortState(sort);
	const selectable = sortSelect.selectEl.querySelector(
		`option[value="${CSS.escape(encoded)}"]`,
	);
	sortSelect
		.setValue(selectable ? encoded : "newest")
		.onChange((value) => onSortChange(decodeSortState(value)));

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
		setActiveView: savedViewsHandle.setActiveView,
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
