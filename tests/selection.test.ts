import { describe, expect, test } from "bun:test";
import type { AreaItem } from "../src/types";
import {
	countHiddenSelected,
	partitionSelected,
	pruneSelection,
} from "../src/views/area-gallery/selection";

function item(id: string): AreaItem {
	return {
		id,
		type: "image",
		vaultPath: `${id}.png`,
		tags: [],
		addedAt: 0,
	};
}

describe("pruneSelection", () => {
	test("drops ids whose item left the area and reports the change", () => {
		const selected = new Set(["a", "gone"]);
		expect(pruneSelection(selected, [item("a"), item("b")])).toBe(true);
		expect([...selected]).toEqual(["a"]);
	});

	test("reports no change when every selected id still exists", () => {
		const selected = new Set(["a", "b"]);
		expect(pruneSelection(selected, [item("a"), item("b")])).toBe(false);
		expect(selected.size).toBe(2);
	});

	test("skips the scan entirely for an empty selection", () => {
		expect(pruneSelection(new Set(), [])).toBe(false);
	});
});

describe("partitionSelected", () => {
	const items = [item("a"), item("b"), item("c")];

	test("splits the list without mutating the input", () => {
		const { kept, removed } = partitionSelected(items, new Set(["b"]));
		expect(kept.map((entry) => entry.id)).toEqual(["a", "c"]);
		expect(removed.map((entry) => entry.id)).toEqual(["b"]);
		expect(items).toHaveLength(3);
	});

	test("preserves the original order in both halves", () => {
		const { kept, removed } = partitionSelected(items, new Set(["a", "c"]));
		expect(kept.map((entry) => entry.id)).toEqual(["b"]);
		expect(removed.map((entry) => entry.id)).toEqual(["a", "c"]);
	});

	test("ignores selected ids that are not in the list", () => {
		const { kept, removed } = partitionSelected(items, new Set(["ghost"]));
		expect(kept).toHaveLength(3);
		expect(removed).toHaveLength(0);
	});
});

describe("countHiddenSelected", () => {
	test("counts the selected items the filters left out", () => {
		const visible = [item("a")];
		expect(countHiddenSelected(visible, new Set(["a", "b", "c"]))).toBe(2);
	});

	test("is zero when every selected item is on screen", () => {
		const visible = [item("a"), item("b")];
		expect(countHiddenSelected(visible, new Set(["a"]))).toBe(0);
	});

	test("is zero for an empty selection", () => {
		expect(countHiddenSelected([item("a")], new Set())).toBe(0);
	});
});
