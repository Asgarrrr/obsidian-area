import type {
	AreaFieldDef,
	AreaFieldFilter,
	AreaItem,
	AreaSortState,
	FieldValue,
} from "../../types";
import { groupTagsByFacet } from "./facets";
import { matchesFieldFilters } from "./fieldFilters";

type SortOrder = "newest" | "oldest" | "title-az" | "title-za";

interface FilterOptions {
	activeTagFilters: Set<string>;
	searchQuery: string;
	sort: AreaSortState;
	fieldFilters: AreaFieldFilter[];
	// Needed to rank a field sort: whether a value compares as a number or as
	// text comes from its definition, not from what happens to be stored.
	schema?: AreaFieldDef[];
}

export function getFilteredItems(
	items: AreaItem[],
	{ activeTagFilters, searchQuery, sort, fieldFilters, schema }: FilterOptions,
): AreaItem[] {
	// Derived once for the whole pass rather than per item.
	const tagGroups = groupTagsByFacet(activeTagFilters);

	const filtered = items.filter(
		(item) =>
			matchesTagGroups(item, tagGroups) &&
			matchesSearch(item, searchQuery) &&
			matchesFieldFilters(item, fieldFilters),
	);

	// A saved view can outlive the field it sorted on. Falling back to the
	// default order beats crashing or ranking by a column nothing carries.
	const field =
		sort.type === "field"
			? schema?.find((def) => def.id === sort.fieldId)
			: undefined;
	if (sort.type === "field" && field) {
		return filtered.sort((a, b) => compareByField(a, b, field, sort.direction));
	}

	const order: SortOrder = sort.type === "field" ? "newest" : sort.type;
	return filtered.sort((a, b) => compareItems(a, b, order));
}

// Items carrying no value have no rank: they sink to the bottom whichever way
// the ranked ones are pointing, so those stay adjacent.
function compareByField(
	a: AreaItem,
	b: AreaItem,
	field: AreaFieldDef,
	direction: "asc" | "desc",
): number {
	const valueA = rankableValue(a.fields?.[field.id]);
	const valueB = rankableValue(b.fields?.[field.id]);

	if (valueA === undefined && valueB === undefined) return 0;
	if (valueA === undefined) return 1;
	if (valueB === undefined) return -1;

	const ascending =
		field.type === "number"
			? Number(valueA) - Number(valueB)
			: valueA.localeCompare(valueB);

	return direction === "desc" ? -ascending : ascending;
}

// Blank strings rank with the missing values rather than sorting to the top as
// the empty string would.
function rankableValue(value: FieldValue | undefined): string | undefined {
	if (value === undefined || value === null) return undefined;
	const text = String(value).trim();
	return text === "" ? undefined : text;
}

export function getAllTags(items: AreaItem[]): string[] {
	return [...new Set(items.flatMap((item) => item.tags))].sort();
}

export function getTagSignature(tags: string[]): string {
	return tags.join("\u0000");
}

export function pruneActiveTagFilters(
	activeTagFilters: Set<string>,
	allTags: string[],
): boolean {
	const availableTags = new Set(allTags);
	let didPrune = false;

	for (const tag of activeTagFilters) {
		if (!availableTags.has(tag)) {
			activeTagFilters.delete(tag);
			didPrune = true;
		}
	}

	return didPrune;
}

// Values picked inside one facet are alternatives, facets combine: selecting
// bordeaux + terre widens the palette, adding piece/veste on top narrows it.
// Intersecting everything (the previous rule) made any two colours return zero.
function matchesTagGroups(item: AreaItem, tagGroups: string[][]): boolean {
	if (tagGroups.length === 0) return true;
	const itemTags = new Set(item.tags);
	return tagGroups.every((group) => group.some((tag) => itemTags.has(tag)));
}

// Search casts wide — any of title, tags, source URL or a custom field value.
function matchesSearch(item: AreaItem, searchQuery: string): boolean {
	if (searchQuery === "") return true;

	return (
		(item.title?.toLowerCase().includes(searchQuery) ?? false) ||
		item.tags.some((tag) => tag.toLowerCase().includes(searchQuery)) ||
		(item.sourceUrl?.toLowerCase().includes(searchQuery) ?? false) ||
		Object.values(item.fields ?? {}).some((value) =>
			String(value).toLowerCase().includes(searchQuery),
		)
	);
}

function compareItems(a: AreaItem, b: AreaItem, sortOrder: SortOrder): number {
	switch (sortOrder) {
		case "oldest":
			return (a.addedAt ?? 0) - (b.addedAt ?? 0);
		case "title-az":
			return compareTitles(a, b);
		case "title-za":
			return compareTitles(b, a);
		default:
			return (b.addedAt ?? 0) - (a.addedAt ?? 0);
	}
}

function compareTitles(a: AreaItem, b: AreaItem): number {
	const titleA = a.title?.toLowerCase() ?? "";
	const titleB = b.title?.toLowerCase() ?? "";

	if (!titleA && !titleB) return 0;
	if (!titleA) return 1;
	if (!titleB) return -1;
	return titleA.localeCompare(titleB);
}
