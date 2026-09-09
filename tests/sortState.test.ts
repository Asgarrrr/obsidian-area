import { describe, expect, test } from "bun:test";
import type { AreaFieldDef, AreaSortState } from "../src/types";
import {
	buildSortOptions,
	decodeSortState,
	encodeSortState,
} from "../src/views/area-gallery/sortState";

const schema: AreaFieldDef[] = [
	{ id: "rating", label: "Rating", type: "number" },
	{ id: "status", label: "Status", type: "select", options: ["draft"] },
];

describe("encodeSortState / decodeSortState", () => {
	const cases: AreaSortState[] = [
		{ type: "newest" },
		{ type: "oldest" },
		{ type: "title-az" },
		{ type: "title-za" },
		{ type: "field", fieldId: "rating", direction: "asc" },
		{ type: "field", fieldId: "status", direction: "desc" },
	];

	for (const sort of cases) {
		test(`round-trips ${encodeSortState(sort)}`, () => {
			expect(decodeSortState(encodeSortState(sort))).toEqual(sort);
		});
	}

	// Field ids are opaque strings; putting the id last keeps a colon inside one
	// from being read as a delimiter.
	test("survives a colon inside the field id", () => {
		const sort: AreaSortState = {
			type: "field",
			fieldId: "odd:id",
			direction: "asc",
		};
		expect(decodeSortState(encodeSortState(sort))).toEqual(sort);
	});

	test("an unknown value decodes to newest", () => {
		expect(decodeSortState("")).toEqual({ type: "newest" });
		expect(decodeSortState("nonsense")).toEqual({ type: "newest" });
		expect(decodeSortState("field:sideways:rating")).toEqual({
			type: "newest",
		});
		expect(decodeSortState("field:asc:")).toEqual({ type: "newest" });
	});
});

describe("buildSortOptions", () => {
	test("lists the built-in orders first", () => {
		expect(
			buildSortOptions(schema)
				.slice(0, 4)
				.map(([value]) => value),
		).toEqual(["newest", "oldest", "title-az", "title-za"]);
	});

	test("adds both directions for each schema field", () => {
		expect(buildSortOptions(schema).slice(4)).toEqual([
			["field:asc:rating", "Rating ↑"],
			["field:desc:rating", "Rating ↓"],
			["field:asc:status", "Status ↑"],
			["field:desc:status", "Status ↓"],
		]);
	});

	test("an absent or empty schema leaves only the built-in orders", () => {
		expect(buildSortOptions(undefined)).toHaveLength(4);
		expect(buildSortOptions([])).toHaveLength(4);
	});
});
