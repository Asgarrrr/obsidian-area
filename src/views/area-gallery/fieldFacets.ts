import type { AreaFieldDef, AreaFieldFilter, AreaItem } from "../../types";
import type { Facet, FacetValue } from "./facets";

// Custom fields reuse the tag facet UI: one button per field, a multi-select
// popover of the values items actually carry. Values are the ones observed in
// the board, not the schema's — a select option nobody picked is a dead row.

export function buildFieldFacets(
	items: AreaItem[],
	schema: AreaFieldDef[] | undefined,
): Facet[] {
	if (!schema || schema.length === 0) return [];

	return schema
		.map((field) => ({
			key: field.id,
			label: field.label,
			values: buildFieldValues(items, field),
		}))
		.filter((facet) => facet.values.length > 0);
}

// One `is` filter per field, its selected values OR-ed together. Fields with
// nothing selected drop out so they don't constrain the pass.
export function toFieldFilters(
	activeFieldValues: ReadonlyMap<string, ReadonlySet<string>>,
): AreaFieldFilter[] {
	const filters: AreaFieldFilter[] = [];
	for (const [fieldId, values] of activeFieldValues) {
		if (values.size === 0) continue;
		filters.push({ fieldId, operator: "is", values: [...values] });
	}
	return filters;
}

// Selection membership has to compare the way the matcher and the pruner do.
// Exact membership let a filter stay active while its facet row read unchecked
// — the pruner keeps "Draft" when the facet has re-cased to "draft" — and the
// click that should have cleared it added a second spelling instead.
export function hasFieldValue(
	values: ReadonlySet<string>,
	value: string,
): boolean {
	return findStoredValue(values, value) !== undefined;
}

export function toggleFieldValue(values: Set<string>, value: string): void {
	const stored = findStoredValue(values, value);
	if (stored === undefined) values.add(value);
	else values.delete(stored);
}

function findStoredValue(
	values: ReadonlySet<string>,
	value: string,
): string | undefined {
	const needle = value.trim().toLowerCase();
	for (const stored of values) {
		if (stored.trim().toLowerCase() === needle) return stored;
	}
	return undefined;
}

// Editing items can strip the last item holding a selected value, leaving a
// highlighted button that matches nothing. Mirrors pruneActiveTagFilters.
export function pruneActiveFieldValues(
	activeFieldValues: Map<string, Set<string>>,
	facets: Facet[],
): boolean {
	const available = new Map(
		facets.map((facet) => [
			facet.key,
			new Set(facet.values.map((value) => value.tag.toLowerCase())),
		]),
	);
	let didPrune = false;

	for (const [fieldId, values] of activeFieldValues) {
		const known = available.get(fieldId);
		if (!known) {
			activeFieldValues.delete(fieldId);
			didPrune = true;
			continue;
		}

		for (const value of values) {
			if (known.has(value.toLowerCase())) continue;
			values.delete(value);
			didPrune = true;
		}

		if (values.size === 0) activeFieldValues.delete(fieldId);
	}

	return didPrune;
}

// Identifies which field values exist, so the toolbar re-renders when that set
// shifts. Counts are deliberately excluded: they move on every import, and a
// re-render would tear down an open facet menu mid-click.
export function getFieldFacetSignature(facets: Facet[]): string {
	return facets
		.map((facet) => `${facet.key}:${facet.values.map((v) => v.tag).join(",")}`)
		.join(" ");
}

function buildFieldValues(
	items: AreaItem[],
	field: AreaFieldDef,
): FacetValue[] {
	// Keyed by the normalized form the matcher compares on: "Draft" and "draft "
	// select the same items, so listing both would make one entry look inert.
	const counts = new Map<string, FacetValue>();

	for (const item of items) {
		const raw = item.fields?.[field.id];
		if (raw === undefined || raw === null) continue;
		const display = String(raw).trim();
		if (display === "") continue;

		const key = display.toLowerCase();
		const seen = counts.get(key);
		if (seen) seen.count += 1;
		else counts.set(key, { tag: display, label: display, count: 1 });
	}

	return sortFieldValues([...counts.values()], field);
}

function sortFieldValues(
	values: FacetValue[],
	field: AreaFieldDef,
): FacetValue[] {
	if (field.type === "select")
		return sortBySchemaOptions(values, field.options);
	if (field.type === "number") {
		return values.sort((a, b) => Number(a.tag) - Number(b.tag));
	}
	return values.sort((a, b) => a.label.localeCompare(b.label));
}

// A workflow's options carry an order — draft precedes final. Values the schema
// doesn't list are hand-edited leftovers; they keep their place at the end.
function sortBySchemaOptions(
	values: FacetValue[],
	options: string[] | undefined,
): FacetValue[] {
	if (!options || options.length === 0) {
		return values.sort((a, b) => a.label.localeCompare(b.label));
	}

	const rank = new Map<string, number>();
	options.forEach((option, index) =>
		rank.set(option.trim().toLowerCase(), index),
	);

	return values.sort((a, b) => {
		const rankA = rank.get(a.tag.toLowerCase()) ?? options.length;
		const rankB = rank.get(b.tag.toLowerCase()) ?? options.length;
		if (rankA !== rankB) return rankA - rankB;
		return a.label.localeCompare(b.label);
	});
}
