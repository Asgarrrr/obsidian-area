import { describe, expect, test } from "bun:test";
import type { AreaItem } from "../src/types";
import {
	buildFacets,
	getTagNamespace,
	groupTagsByFacet,
} from "../src/views/area-gallery/facets";

function item(id: string, tags: string[]): AreaItem {
	return {
		id,
		type: "image",
		vaultPath: `${id}.png`,
		tags,
		addedAt: 0,
	};
}

describe("getTagNamespace", () => {
	test("returns the segment before the first slash", () => {
		expect(getTagNamespace("palette/bordeaux")).toBe("palette");
		expect(getTagNamespace("a/b/c")).toBe("a");
	});

	test("returns an empty namespace when there is nothing to group by", () => {
		expect(getTagNamespace("bordeaux")).toBe("");
		// A leading slash leaves no name in front of it, so it is ungrouped too.
		expect(getTagNamespace("/bordeaux")).toBe("");
	});
});

describe("buildFacets", () => {
	const items = [
		item("a", ["palette/bordeaux", "piece/veste", "wip"]),
		item("b", ["palette/bordeaux", "piece/manteau"]),
		item("c", ["palette/terre"]),
	];

	test("groups tags by namespace and counts the items carrying each", () => {
		const facets = buildFacets(items);
		expect(facets.map((f) => f.key)).toEqual(["palette", "piece", ""]);

		const palette = facets[0];
		expect(palette?.label).toBe("Palette");
		expect(palette?.values).toEqual([
			{ tag: "palette/bordeaux", label: "bordeaux", count: 2 },
			{ tag: "palette/terre", label: "terre", count: 1 },
		]);
	});

	test("files namespaceless tags last, under a catch-all", () => {
		const facets = buildFacets(items);
		const last = facets[facets.length - 1];
		expect(last?.label).toBe("Other");
		expect(last?.values).toEqual([{ tag: "wip", label: "wip", count: 1 }]);
	});

	test("counts an item once even if it repeats a tag", () => {
		const facets = buildFacets([item("a", ["piece/veste", "piece/veste"])]);
		expect(facets[0]?.values[0]?.count).toBe(1);
	});

	test("returns nothing for items without tags", () => {
		expect(buildFacets([item("a", [])])).toEqual([]);
	});
});

describe("groupTagsByFacet", () => {
	test("collects selected tags into one group per namespace", () => {
		const groups = groupTagsByFacet([
			"palette/bordeaux",
			"piece/veste",
			"palette/terre",
		]);
		expect(groups).toHaveLength(2);
		expect(groups).toContainEqual(["palette/bordeaux", "palette/terre"]);
		expect(groups).toContainEqual(["piece/veste"]);
	});

	test("keeps namespaceless tags in a group of their own", () => {
		expect(groupTagsByFacet(["wip", "piece/veste"])).toHaveLength(2);
	});
});
