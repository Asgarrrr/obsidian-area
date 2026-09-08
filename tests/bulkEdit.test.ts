import { describe, expect, test } from "bun:test";
import type { AreaItem } from "../src/types";
import {
	applyBulkPatch,
	type BulkPatch,
	cyclePill,
	isEmptyPatch,
	pillsToTagPatch,
	summarizeSelection,
	type TagPill,
} from "../src/views/area-gallery/bulkEdit";

function item(
	id: string,
	tags: string[] = [],
	extra: Partial<AreaItem> = {},
): AreaItem {
	return {
		id,
		type: "image",
		vaultPath: `${id}.png`,
		tags,
		addedAt: 0,
		...extra,
	};
}

const emptyPatch = (): BulkPatch => ({
	addTags: [],
	removeTags: [],
	fields: {},
});

describe("summarizeSelection — tags", () => {
	test("classifies common and partial with counts, keeping first-seen casing", () => {
		const s = summarizeSelection(
			[item("a", ["Design", "ui"]), item("b", ["design"])],
			[],
		);
		expect(s.total).toBe(2);
		expect(s.pills).toEqual([
			{ tag: "Design", count: 2, total: 2, initial: "common", state: "common" },
			{ tag: "ui", count: 1, total: 2, initial: "partial", state: "partial" },
		]);
	});

	test("counts a case-duplicated tag once per item", () => {
		const s = summarizeSelection([item("a", ["x", "X"])], []);
		expect(s.pills).toHaveLength(1);
		expect(s.pills[0].count).toBe(1);
	});
});

describe("summarizeSelection — values", () => {
	test("identical everywhere is common, differing is mixed, absent is empty", () => {
		const s = summarizeSelection(
			[
				item("a", [], { sourceUrl: "u", fields: { f: "same", g: "one" } }),
				item("b", [], { sourceUrl: "u", fields: { f: "same", g: "two" } }),
			],
			["f", "g", "h"],
		);
		expect(s.sourceUrl).toEqual({ state: "common", value: "u" });
		expect(s.fields.f).toEqual({ state: "common", value: "same" });
		expect(s.fields.g).toEqual({ state: "mixed" });
		expect(s.fields.h).toEqual({ state: "empty" });
	});

	test("a value present on only some items is mixed, not common", () => {
		const s = summarizeSelection(
			[item("a", [], { sourceUrl: "u" }), item("b")],
			[],
		);
		expect(s.sourceUrl).toEqual({ state: "mixed" });
	});
});

describe("cyclePill", () => {
	const pill = (
		initial: TagPill["initial"],
		state: TagPill["state"],
	): TagPill => ({ tag: "t", count: 1, total: 2, initial, state });

	test("initially partial cycles partial → common → removed → partial", () => {
		expect(cyclePill(pill("partial", "partial"))).toBe("common");
		expect(cyclePill(pill("partial", "common"))).toBe("removed");
		expect(cyclePill(pill("partial", "removed"))).toBe("partial");
	});

	test("initially common toggles common ⇄ removed", () => {
		expect(cyclePill(pill("common", "common"))).toBe("removed");
		expect(cyclePill(pill("common", "removed"))).toBe("common");
	});

	test("a new pill is cycle-inert", () => {
		expect(cyclePill(pill("new", "new"))).toBe("new");
	});
});

describe("pillsToTagPatch", () => {
	test("promoted partials and new pills add; removed pills remove; untouched do nothing", () => {
		const pills: TagPill[] = [
			{ tag: "keep", count: 2, total: 2, initial: "common", state: "common" },
			{ tag: "promo", count: 1, total: 2, initial: "partial", state: "common" },
			{ tag: "idle", count: 1, total: 2, initial: "partial", state: "partial" },
			{ tag: "gone", count: 2, total: 2, initial: "common", state: "removed" },
			{ tag: "typed", count: 0, total: 2, initial: "new", state: "new" },
		];
		expect(pillsToTagPatch(pills)).toEqual({
			addTags: ["promo", "typed"],
			removeTags: ["gone"],
		});
	});

	test("a promoted-then-reverted pill yields an empty diff", () => {
		const pills: TagPill[] = [
			{ tag: "t", count: 1, total: 2, initial: "partial", state: "partial" },
		];
		expect(pillsToTagPatch(pills)).toEqual({ addTags: [], removeTags: [] });
	});
});

describe("applyBulkPatch", () => {
	test("adds, removes, and counts only items actually changed", () => {
		const items = [item("a", ["x"]), item("b", ["x", "add"]), item("c")];
		const changed = applyBulkPatch(items, new Set(["a", "b"]), {
			...emptyPatch(),
			addTags: ["add"],
		});
		expect(changed).toBe(1); // b already had it
		expect(items[0].tags).toEqual(["x", "add"]);
		expect(items[2].tags).toEqual([]); // not selected
	});

	test("remove matches case-insensitively", () => {
		const items = [item("a", ["Design", "ui"])];
		const changed = applyBulkPatch(items, new Set(["a"]), {
			...emptyPatch(),
			removeTags: ["design"],
		});
		expect(changed).toBe(1);
		expect(items[0].tags).toEqual(["ui"]);
	});

	test("add rewrites case variants in place to the pill casing", () => {
		const items = [item("a", ["design", "ui"]), item("b", ["ux"])];
		applyBulkPatch(items, new Set(["a", "b"]), {
			...emptyPatch(),
			addTags: ["Design"],
		});
		expect(items[0].tags).toEqual(["Design", "ui"]); // rewritten, position kept
		expect(items[1].tags).toEqual(["ux", "Design"]); // appended
	});

	test("set and clear on sourceUrl and fields honor the fieldValues invariant", () => {
		const items = [
			item("a", [], { sourceUrl: "old", fields: { f: "v" } }),
			item("b"),
		];
		const changed = applyBulkPatch(items, new Set(["a", "b"]), {
			...emptyPatch(),
			sourceUrl: { action: "set", value: "new" },
			fields: { f: { action: "clear" } },
		});
		expect(changed).toBe(2);
		expect(items[0].sourceUrl).toBe("new");
		expect(items[0].fields).toBeUndefined();
		expect(items[1].sourceUrl).toBe("new");
	});

	test("setting sourceUrl to an empty string is a clear, not a write", () => {
		const items = [item("a")];
		const changed = applyBulkPatch(items, new Set(["a"]), {
			...emptyPatch(),
			sourceUrl: { action: "set", value: "" },
		});
		expect(changed).toBe(0);
		expect(items[0].sourceUrl).toBeUndefined();
	});

	test("setting a field to an empty string behaves exactly like clear", () => {
		const items = [item("a", [], { fields: { f: "v" } }), item("b")];
		const changed = applyBulkPatch(items, new Set(["a", "b"]), {
			...emptyPatch(),
			fields: { f: { action: "set", value: "" } },
		});
		expect(changed).toBe(1); // b had no value to clear
		expect(items[0].fields).toBeUndefined();
		expect(items[1].fields).toBeUndefined();
	});

	test("ids that vanished from the area are skipped", () => {
		const items = [item("a")];
		const changed = applyBulkPatch(items, new Set(["a", "ghost"]), {
			...emptyPatch(),
			addTags: ["t"],
		});
		expect(changed).toBe(1);
	});

	test("a patch that changes nothing reports zero", () => {
		const items = [item("a", ["t"])];
		expect(
			applyBulkPatch(items, new Set(["a"]), {
				...emptyPatch(),
				addTags: ["t"],
			}),
		).toBe(0);
	});
});

describe("isEmptyPatch", () => {
	test("empty patch is empty; any component makes it non-empty", () => {
		expect(isEmptyPatch(emptyPatch())).toBe(true);
		expect(isEmptyPatch({ ...emptyPatch(), removeTags: ["t"] })).toBe(false);
		expect(
			isEmptyPatch({ ...emptyPatch(), sourceUrl: { action: "clear" } }),
		).toBe(false);
		expect(
			isEmptyPatch({ ...emptyPatch(), fields: { f: { action: "clear" } } }),
		).toBe(false);
	});
});
