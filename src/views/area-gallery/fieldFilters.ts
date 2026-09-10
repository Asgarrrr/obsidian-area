import type { AreaFieldFilter, AreaItem, FieldValue } from "../../types";

// Custom-field constraints, kept pure and free of Obsidian imports so the
// matcher stays `bun test`-safe. Tag facets OR within a facet and AND across
// them; field filters follow the same rule — `values` is the union, and
// separate filters intersect.

export function matchesFieldFilters(
	item: AreaItem,
	filters: AreaFieldFilter[],
): boolean {
	if (filters.length === 0) return true;

	return filters.every((filter) =>
		matchesFieldFilter(item.fields?.[filter.fieldId], filter),
	);
}

function matchesFieldFilter(
	value: FieldValue | undefined,
	filter: AreaFieldFilter,
): boolean {
	switch (filter.operator) {
		case "is":
			return matchesAnyValue(value, filter.values);
		case "is-not":
			return !matchesAnyValue(value, filter.values);
		case "contains":
			return (
				value !== undefined &&
				normalize(value).includes(filter.value.trim().toLowerCase())
			);
		case "empty":
			return isEmpty(value);
		case "not-empty":
			return !isEmpty(value);
	}
}

// Compared as normalized strings: hand-edited files store a number field as
// `4` or `"4"` interchangeably, and strict equality would drop half of them.
function matchesAnyValue(
	value: FieldValue | undefined,
	values: FieldValue[],
): boolean {
	if (value === undefined) return false;
	const normalized = normalize(value);
	return values.some((candidate) => normalize(candidate) === normalized);
}

// A blank string counts as empty; the number 0 does not — it is a real value.
function isEmpty(value: FieldValue | undefined): boolean {
	if (value === undefined || value === null) return true;
	return typeof value === "string" && value.trim() === "";
}

function normalize(value: FieldValue): string {
	return String(value).trim().toLowerCase();
}
