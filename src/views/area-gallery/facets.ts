import type { AreaItem } from "../../types";

// Tags are namespaced (`palette/bordeaux`, `piece/veste`). The segment before
// the first slash is the facet; everything after it is the value. Tags without
// a slash collapse into one unnamed facet so they stay filterable.

export interface FacetValue {
	tag: string;
	// Value shown inside the facet menu — the tag minus its namespace.
	label: string;
	count: number;
}

export interface Facet {
	// Namespace, or "" for tags carrying no slash.
	key: string;
	label: string;
	values: FacetValue[];
}

const UNGROUPED_LABEL = "Other";

export function getTagNamespace(tag: string): string {
	const slash = tag.indexOf("/");
	return slash > 0 ? tag.slice(0, slash) : "";
}

export function buildFacets(items: AreaItem[]): Facet[] {
	const counts = new Map<string, number>();
	for (const item of items) {
		// A tag repeated on one item must not count twice.
		for (const tag of new Set(item.tags)) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}

	const facets = new Map<string, FacetValue[]>();
	for (const [tag, count] of counts) {
		const key = getTagNamespace(tag);
		const label = key ? tag.slice(key.length + 1) : tag;
		const values = facets.get(key);
		if (values) values.push({ tag, label, count });
		else facets.set(key, [{ tag, label, count }]);
	}

	return (
		[...facets.entries()]
			.map(([key, values]) => ({
				key,
				label: key ? toFacetLabel(key) : UNGROUPED_LABEL,
				values: values.sort((a, b) => a.label.localeCompare(b.label)),
			}))
			// Named facets first, alphabetically; the catch-all sits last.
			.sort((a, b) => {
				if (!a.key !== !b.key) return a.key ? -1 : 1;
				return a.label.localeCompare(b.label);
			})
	);
}

// Group the active filters by facet so the matcher can OR inside a facet and
// AND across facets without re-deriving namespaces per item.
export function groupTagsByFacet(tags: Iterable<string>): string[][] {
	const groups = new Map<string, string[]>();
	for (const tag of tags) {
		const key = getTagNamespace(tag);
		const group = groups.get(key);
		if (group) group.push(tag);
		else groups.set(key, [tag]);
	}
	return [...groups.values()];
}

function toFacetLabel(key: string): string {
	return key.charAt(0).toUpperCase() + key.slice(1);
}
