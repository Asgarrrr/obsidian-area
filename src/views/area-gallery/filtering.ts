import type { AreaItem } from "../../types";

export type SortOrder = "newest" | "oldest" | "title-az" | "title-za";

interface FilterOptions {
	activeTagFilters: Set<string>;
	searchQuery: string;
	sortOrder: SortOrder;
}

export function getFilteredItems(
	items: AreaItem[],
	{ activeTagFilters, searchQuery, sortOrder }: FilterOptions,
): AreaItem[] {
	const filtered = items.filter((item) => {
		// Tag filters intersect: each active filter narrows the set. Search below
		// stays a union — searching casts wide, filtering narrows.
		const matchesTags =
			activeTagFilters.size === 0 ||
			[...activeTagFilters].every((tag) => item.tags.includes(tag));
		const matchesSearch =
			searchQuery === "" ||
			(item.title?.toLowerCase().includes(searchQuery) ?? false) ||
			item.tags.some((tag) => tag.toLowerCase().includes(searchQuery)) ||
			(item.sourceUrl?.toLowerCase().includes(searchQuery) ?? false);
		return matchesTags && matchesSearch;
	});

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
