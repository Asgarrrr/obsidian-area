import type { AreaFieldDef, AreaSortState } from "../../types";

// A <select> carries one string per option, so a field sort has to survive the
// round trip through it. The field id goes last: ids are opaque, and a colon
// inside one would otherwise read as a delimiter.

const BUILT_IN_ORDERS: ReadonlyArray<readonly [AreaSortState["type"], string]> =
	[
		["newest", "Newest first"],
		["oldest", "Oldest first"],
		["title-az", "Title A → Z"],
		["title-za", "Title Z → A"],
	];

const DEFAULT_SORT: AreaSortState = { type: "newest" };

export function encodeSortState(sort: AreaSortState): string {
	if (sort.type !== "field") return sort.type;
	return `field:${sort.direction}:${sort.fieldId}`;
}

// Tolerant by design: the value can come from a hand-edited saved view, and an
// unreadable order is not worth failing a render over.
export function decodeSortState(value: string): AreaSortState {
	for (const [type] of BUILT_IN_ORDERS) {
		if (value === type) return { type } as AreaSortState;
	}

	const match = /^field:(asc|desc):(.+)$/.exec(value);
	if (!match) return DEFAULT_SORT;

	const [, direction, fieldId] = match;
	return {
		type: "field",
		fieldId: fieldId as string,
		direction: direction as "asc" | "desc",
	};
}

// The built-in orders, then both directions of every schema field.
export function buildSortOptions(
	schema: AreaFieldDef[] | undefined,
): Array<[string, string]> {
	const options: Array<[string, string]> = BUILT_IN_ORDERS.map(
		([type, label]) => [type, label],
	);

	for (const field of schema ?? []) {
		options.push([`field:asc:${field.id}`, `${field.label} ↑`]);
		options.push([`field:desc:${field.id}`, `${field.label} ↓`]);
	}

	return options;
}
