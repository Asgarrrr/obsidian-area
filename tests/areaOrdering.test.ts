import { describe, expect, test } from "bun:test";
import { orderAreasByRecency } from "../src/commands/areaOrdering";

const area = (path: string, basename: string) => ({ path, basename });

describe("orderAreasByRecency", () => {
	test("recently opened areas come first, in recency order", () => {
		const ordered = orderAreasByRecency(
			[area("z.area", "z"), area("a.area", "a"), area("m.area", "m")],
			["m.area", "z.area"],
		);
		expect(ordered.map((f) => f.path)).toEqual(["m.area", "z.area", "a.area"]);
	});

	test("areas never opened sort alphabetically by basename", () => {
		const ordered = orderAreasByRecency(
			[area("2.area", "beta"), area("1.area", "alpha")],
			[],
		);
		expect(ordered.map((f) => f.basename)).toEqual(["alpha", "beta"]);
	});

	test("recency paths that are not areas are ignored", () => {
		const ordered = orderAreasByRecency(
			[area("a.area", "a")],
			["note.md", "a.area"],
		);
		expect(ordered.map((f) => f.path)).toEqual(["a.area"]);
	});
});
