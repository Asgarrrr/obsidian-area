import { describe, expect, test } from "bun:test";
import type {
	AreaFieldDef,
	AreaFieldFilter,
	AreaItem,
	AreaSortState,
} from "../src/types";
import {
	getAllTags,
	getFilteredItems,
	getTagSignature,
	pruneActiveTagFilters,
} from "../src/views/area-gallery/filtering";

function item(partial: Partial<AreaItem>): AreaItem {
	return {
		id: partial.id ?? "id",
		type: "image",
		vaultPath: partial.vaultPath ?? "p.png",
		tags: partial.tags ?? [],
		addedAt: partial.addedAt ?? 0,
		title: partial.title,
		sourceUrl: partial.sourceUrl,
		fields: partial.fields,
	};
}

function opts(
	o: Partial<{
		activeTagFilters: Set<string>;
		searchQuery: string;
		sort: AreaSortState;
		fieldFilters: AreaFieldFilter[];
		schema: AreaFieldDef[];
	}> = {},
) {
	return {
		activeTagFilters: o.activeTagFilters ?? new Set<string>(),
		searchQuery: o.searchQuery ?? "",
		sort: o.sort ?? ({ type: "newest" } as AreaSortState),
		fieldFilters: o.fieldFilters ?? [],
		schema: o.schema,
	};
}

describe("getFilteredItems", () => {
	const items = [
		item({ id: "a", title: "Blue sky", tags: ["nature"], addedAt: 3 }),
		item({
			id: "b",
			title: "Red car",
			tags: ["vehicle"],
			addedAt: 1,
			sourceUrl: "https://cars.example",
		}),
		item({
			id: "c",
			title: "Green tree",
			tags: ["nature", "plant"],
			addedAt: 2,
		}),
	];

	test("newest is the default sort (desc by addedAt)", () => {
		expect(getFilteredItems(items, opts()).map((i) => i.id)).toEqual([
			"a",
			"c",
			"b",
		]);
	});

	test("oldest ascends by addedAt", () => {
		expect(
			getFilteredItems(items, opts({ sort: { type: "oldest" } })).map(
				(i) => i.id,
			),
		).toEqual(["b", "c", "a"]);
	});

	test("title-az / title-za sort alphabetically", () => {
		expect(
			getFilteredItems(items, opts({ sort: { type: "title-az" } })).map(
				(i) => i.title,
			),
		).toEqual(["Blue sky", "Green tree", "Red car"]);
		expect(
			getFilteredItems(items, opts({ sort: { type: "title-za" } })).map(
				(i) => i.title,
			),
		).toEqual(["Red car", "Green tree", "Blue sky"]);
	});

	test("tag filter keeps only items carrying an active tag", () => {
		const out = getFilteredItems(
			items,
			opts({ activeTagFilters: new Set(["nature"]) }),
		);
		expect(out.map((i) => i.id).sort()).toEqual(["a", "c"]);
	});

	test("search matches title, tag, and sourceUrl", () => {
		expect(
			getFilteredItems(items, opts({ searchQuery: "sky" })).map((i) => i.id),
		).toEqual(["a"]);
		expect(
			getFilteredItems(items, opts({ searchQuery: "plant" })).map((i) => i.id),
		).toEqual(["c"]);
		expect(
			getFilteredItems(items, opts({ searchQuery: "cars.example" })).map(
				(i) => i.id,
			),
		).toEqual(["b"]);
	});

	test("does not mutate the input array", () => {
		const input = [...items];
		getFilteredItems(input, opts({ sort: { type: "oldest" } }));
		expect(input.map((i) => i.id)).toEqual(["a", "b", "c"]);
	});
});

describe("getFilteredItems — tag intersection", () => {
	// Facet-shaped fixtures: prefix/value tags across four axes, the way a real
	// reference board is tagged. Intersection is what makes them worth filtering.
	const items = [
		item({
			id: "linear-nav",
			tags: [
				"pattern/navbar",
				"style/glass",
				"tech/scroll-driven",
				"from/linear",
			],
		}),
		item({
			id: "vercel-nav",
			tags: ["pattern/navbar", "style/minimal", "from/vercel"],
		}),
		item({
			id: "glass-card",
			tags: ["pattern/card", "style/glass", "from/linear"],
		}),
		item({
			id: "mixed-card",
			tags: ["pattern/card", "style/glass", "style/brutalist", "from/dribbble"],
		}),
	];

	function ids(activeTagFilters: string[]): string[] {
		return getFilteredItems(
			items,
			opts({ activeTagFilters: new Set(activeTagFilters) }),
		)
			.map((i) => i.id)
			.sort();
	}

	test("no active filter returns everything", () => {
		expect(ids([])).toEqual([
			"glass-card",
			"linear-nav",
			"mixed-card",
			"vercel-nav",
		]);
	});

	test("two filters keep only items carrying both", () => {
		expect(ids(["pattern/navbar", "style/glass"])).toEqual(["linear-nav"]);
	});

	test("a third filter narrows further", () => {
		expect(ids(["pattern/navbar", "style/glass", "from/linear"])).toEqual([
			"linear-nav",
		]);
		expect(ids(["pattern/navbar", "style/glass", "from/vercel"])).toEqual([]);
	});

	test("removing one of two filters widens the result set back", () => {
		expect(ids(["pattern/card", "style/brutalist"])).toEqual(["mixed-card"]);
		expect(ids(["pattern/card"])).toEqual(["glass-card", "mixed-card"]);
	});

	test("two values on one axis widen to their union", () => {
		expect(ids(["style/brutalist"])).toEqual(["mixed-card"]);
		expect(ids(["style/glass"])).toEqual([
			"glass-card",
			"linear-nav",
			"mixed-card",
		]);
		// Faceted semantics: picking a second style asks for "either style",
		// not "both styles on one item", which no realistic pair satisfies.
		expect(ids(["style/glass", "style/brutalist"])).toEqual([
			"glass-card",
			"linear-nav",
			"mixed-card",
		]);
	});

	test("union within an axis still intersects across axes", () => {
		expect(ids(["style/glass", "style/brutalist", "pattern/card"])).toEqual([
			"glass-card",
			"mixed-card",
		]);
	});

	test("a combination no item satisfies returns empty", () => {
		expect(ids(["pattern/navbar", "from/dribbble"])).toEqual([]);
	});

	test("search narrows within the active tag filters", () => {
		const out = getFilteredItems(
			items,
			opts({
				activeTagFilters: new Set(["style/glass"]),
				searchQuery: "navbar",
			}),
		);
		expect(out.map((i) => i.id)).toEqual(["linear-nav"]);
	});
});

describe("getFilteredItems — custom field filters", () => {
	const items = [
		item({
			id: "coat",
			title: "Wool coat",
			tags: ["piece/veste"],
			addedAt: 3,
			fields: { status: "final", rating: 5 },
		}),
		item({
			id: "shirt",
			title: "Linen shirt",
			tags: ["piece/chemise"],
			addedAt: 2,
			fields: { status: "draft", rating: 3 },
		}),
		item({ id: "untagged", title: "No fields", addedAt: 1 }),
	];

	function ids(fieldFilters: AreaFieldFilter[]): string[] {
		return getFilteredItems(items, opts({ fieldFilters }))
			.map((i) => i.id)
			.sort();
	}

	test("no field filter returns everything", () => {
		expect(ids([])).toEqual(["coat", "shirt", "untagged"]);
	});

	test("a select field narrows to the matching items", () => {
		expect(
			ids([{ fieldId: "status", operator: "is", values: ["final"] }]),
		).toEqual(["coat"]);
	});

	test("two values on one field widen to their union", () => {
		expect(
			ids([{ fieldId: "status", operator: "is", values: ["final", "draft"] }]),
		).toEqual(["coat", "shirt"]);
	});

	test("not-empty excludes items carrying no value", () => {
		expect(ids([{ fieldId: "status", operator: "not-empty" }])).toEqual([
			"coat",
			"shirt",
		]);
		expect(ids([{ fieldId: "status", operator: "empty" }])).toEqual([
			"untagged",
		]);
	});

	test("field filters intersect with tag filters and search", () => {
		const out = getFilteredItems(
			items,
			opts({
				activeTagFilters: new Set(["piece/veste"]),
				searchQuery: "wool",
				fieldFilters: [
					{ fieldId: "status", operator: "is", values: ["final"] },
				],
			}),
		);
		expect(out.map((i) => i.id)).toEqual(["coat"]);
	});

	test("a field filter that excludes the searched item returns empty", () => {
		const out = getFilteredItems(
			items,
			opts({
				searchQuery: "wool",
				fieldFilters: [
					{ fieldId: "status", operator: "is", values: ["draft"] },
				],
			}),
		);
		expect(out).toEqual([]);
	});
});

describe("getFilteredItems — sort by custom field", () => {
	const schema: AreaFieldDef[] = [
		{ id: "rating", label: "Rating", type: "number" },
		{ id: "note", label: "Note", type: "text" },
	];

	const items = [
		item({ id: "nine", addedAt: 3, fields: { rating: 9, note: "wool" } }),
		item({ id: "ten", addedAt: 2, fields: { rating: 10, note: "alpaca" } }),
		item({ id: "none", addedAt: 1 }),
	];

	function ids(sort: AreaSortState): string[] {
		return getFilteredItems(items, opts({ sort, schema })).map((i) => i.id);
	}

	// Lexicographic ordering would put "10" before "9" and quietly misrank
	// every rating above single digits.
	test("a number field ascends numerically", () => {
		expect(ids({ type: "field", fieldId: "rating", direction: "asc" })).toEqual(
			["nine", "ten", "none"],
		);
	});

	test("descending reverses the ranked items", () => {
		expect(
			ids({ type: "field", fieldId: "rating", direction: "desc" }),
		).toEqual(["ten", "nine", "none"]);
	});

	test("a text field sorts alphabetically", () => {
		expect(ids({ type: "field", fieldId: "note", direction: "asc" })).toEqual([
			"ten",
			"nine",
			"none",
		]);
	});

	// An item with no value has no rank. Sending it to the bottom in both
	// directions keeps the ranked items adjacent, as title sorting already does.
	test("items missing the field sort last in both directions", () => {
		expect(
			ids({ type: "field", fieldId: "rating", direction: "asc" }).at(-1),
		).toBe("none");
		expect(
			ids({ type: "field", fieldId: "rating", direction: "desc" }).at(-1),
		).toBe("none");
	});

	test("a blank value ranks with the missing ones", () => {
		const withBlank = [
			item({ id: "blank", addedAt: 4, fields: { rating: "  " } }),
			...items,
		];
		const out = getFilteredItems(
			withBlank,
			opts({
				sort: { type: "field", fieldId: "rating", direction: "asc" },
				schema,
			}),
		).map((i) => i.id);
		expect(out.slice(0, 2)).toEqual(["nine", "ten"]);
		expect(out.slice(2).sort()).toEqual(["blank", "none"]);
	});

	// A saved view outlives the field it sorted on; falling back beats crashing
	// or returning an arbitrary order.
	test("a sort on a field the schema no longer defines falls back to newest", () => {
		expect(ids({ type: "field", fieldId: "gone", direction: "asc" })).toEqual([
			"nine",
			"ten",
			"none",
		]);
	});

	test("without a schema a field sort falls back to newest", () => {
		expect(
			getFilteredItems(
				items,
				opts({ sort: { type: "field", fieldId: "rating", direction: "asc" } }),
			).map((i) => i.id),
		).toEqual(["nine", "ten", "none"]);
	});

	test("items sharing a value keep their input order", () => {
		const tied = [
			item({ id: "first", addedAt: 1, fields: { rating: 5 } }),
			item({ id: "second", addedAt: 9, fields: { rating: 5 } }),
			item({ id: "third", addedAt: 4, fields: { rating: 5 } }),
		];
		expect(
			getFilteredItems(
				tied,
				opts({
					sort: { type: "field", fieldId: "rating", direction: "asc" },
					schema,
				}),
			).map((i) => i.id),
		).toEqual(["first", "second", "third"]);
	});
});

describe("getAllTags", () => {
	test("returns a sorted, de-duplicated tag list", () => {
		expect(
			getAllTags([item({ tags: ["b", "a"] }), item({ tags: ["a", "c"] })]),
		).toEqual(["a", "b", "c"]);
	});
});

describe("pruneActiveTagFilters", () => {
	test("removes filters no longer available and reports the change", () => {
		const active = new Set(["a", "gone"]);
		expect(pruneActiveTagFilters(active, ["a", "b"])).toBe(true);
		expect([...active]).toEqual(["a"]);
	});

	test("returns false when nothing to prune", () => {
		expect(pruneActiveTagFilters(new Set(["a"]), ["a", "b"])).toBe(false);
	});
});

describe("getTagSignature", () => {
	test("is order-sensitive and null-joined", () => {
		expect(getTagSignature(["a", "b"])).toBe("a\u0000b");
		expect(getTagSignature(["a", "b"])).not.toBe(getTagSignature(["b", "a"]));
	});
});
