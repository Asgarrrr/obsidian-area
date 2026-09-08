import type { AreaItem } from "../../types";

// Selection is held as a flat set of item ids rather than a list of items, so it
// survives the re-renders that filtering, sorting and importing trigger — the
// cards are rebuilt every pass but their ids outlive them.

/**
 * Drops ids that no longer name an item in the area. Returns true when anything
 * was dropped, so the caller knows the bulk bar needs repainting.
 */
export function pruneSelection(
	selected: Set<string>,
	items: AreaItem[],
): boolean {
	if (selected.size === 0) return false;

	const known = new Set(items.map((item) => item.id));
	let didPrune = false;
	for (const id of selected) {
		if (known.has(id)) continue;
		selected.delete(id);
		didPrune = true;
	}

	return didPrune;
}

/**
 * Splits the area's items into the ones to keep and the ones to remove. Pure by
 * design: the caller decides when to swap the list in and save.
 */
export function partitionSelected(
	items: AreaItem[],
	selected: Set<string>,
): { kept: AreaItem[]; removed: AreaItem[] } {
	const kept: AreaItem[] = [];
	const removed: AreaItem[] = [];
	for (const item of items) {
		if (selected.has(item.id)) removed.push(item);
		else kept.push(item);
	}

	return { kept, removed };
}

/**
 * How many selected items the current filters hide. Selection deliberately
 * outlives filter changes, so a bulk action can reach items that are off-screen
 * — the count is what makes that visible instead of surprising.
 */
export function countHiddenSelected(
	visible: AreaItem[],
	selected: Set<string>,
): number {
	if (selected.size === 0) return 0;

	const visibleIds = new Set(visible.map((item) => item.id));
	let hidden = 0;
	for (const id of selected) {
		if (!visibleIds.has(id)) hidden += 1;
	}

	return hidden;
}
