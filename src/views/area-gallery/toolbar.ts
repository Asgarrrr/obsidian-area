import { ButtonComponent, DropdownComponent, SearchComponent } from "obsidian";
import type { AreaFile } from "../../types";
import { formatAreaTag, renderAreaTagToken } from "../TagInput";
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
}: RenderAreaToolbarOptions): string {
	toolbar.empty();

	const left = toolbar.createDiv("area-toolbar-left");

	const searchWrap = left.createDiv("area-search-container");
	const search = new SearchComponent(searchWrap)
		.setPlaceholder("Search…")
		.setValue(searchQuery)
		.onChange(onSearchChange);
	search.inputEl.addClass("area-search");

	const tagRow = left.createDiv("area-tags");
	const allTags = getAllTags(areaData.items);
	pruneActiveTagFilters(activeTagFilters, allTags);
	const tagSignature = getTagSignature(allTags);

	for (const tag of allTags) {
		const chip = new ButtonComponent(tagRow)
			.setTooltip(`Filter by tag ${formatAreaTag(tag)}`)
			.onClick(() => {
				onTagFilterToggle(tag);
				setTagFilterButtonState(chip.buttonEl, activeTagFilters.has(tag));
			});
		chip.buttonEl.addClass("area-tag-filter");
		chip.buttonEl.setAttribute(
			"aria-label",
			`Filter by tag ${formatAreaTag(tag)}`,
		);
		renderAreaTagToken(chip.buttonEl, tag);
		setTagFilterButtonState(chip.buttonEl, activeTagFilters.has(tag));
	}

	const sortSelect = new DropdownComponent(left);
	sortSelect.selectEl.addClass("area-sort-select");
	for (const [value, label] of SORT_OPTIONS) {
		sortSelect.addOption(value, label);
	}
	sortSelect.setValue(sortOrder).onChange((value) => {
		onSortOrderChange(value as SortOrder);
	});

	const importFilesBtn = new ButtonComponent(toolbar)
		.setIcon("image-plus")
		.setTooltip("Import image files")
		.onClick(onImportFiles);
	importFilesBtn.buttonEl.setAttribute("aria-label", "Import image files");

	const importVaultImageBtn = new ButtonComponent(toolbar)
		.setIcon("folder-open")
		.setTooltip("Add existing vault image")
		.onClick(onImportVaultImage);
	importVaultImageBtn.buttonEl.setAttribute(
		"aria-label",
		"Add existing vault image",
	);

	const schemaBtn = new ButtonComponent(toolbar)
		.setIcon("settings-2")
		.setTooltip("Configure fields")
		.onClick(onConfigureFields);
	schemaBtn.buttonEl.setAttribute("aria-label", "Configure fields");

	return tagSignature;
}

function setTagFilterButtonState(
	buttonEl: HTMLButtonElement,
	active: boolean,
): void {
	buttonEl.setAttribute("aria-pressed", String(active));
	buttonEl.classList.toggle("is-active", active);
	buttonEl.classList.toggle("mod-cta", active);
}
