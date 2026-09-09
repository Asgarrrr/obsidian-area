import type { AreaFieldFilter, AreaItem } from "../../types";
import { groupTagsByFacet } from "./facets";
import { matchesFieldFilters } from "./fieldFilters";

export type SortOrder = "newest" | "oldest" | "title-az" | "title-za";

interface FilterOptions {
	activeTagFilters: Set<string>;
	searchQuery: string;
	sortOrder: SortOrder;
	fieldFilters: AreaFieldFilter[];
}

export function getFilteredItems(
	items: AreaItem[],
	{ activeTagFilters, searchQuery, sortOrder, fieldFilters }: FilterOptions,
): AreaItem[] {
	// Derived once for the whole pass rather than per item.
	const tagGroups = groupTagsByFacet(activeTagFilters);

	const filtered = items.filter(
		(item) =>
			matchesTagGroups(item, tagGroups) &&
			matchesSearch(item, searchQuery) &&
			matchesFieldFilters(item, fieldFilters),
	);

	return filtered.sort((a, b) => compareItems(a, b, sortOrder));
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
