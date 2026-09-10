import { describe, expect, test } from "bun:test";
import type { AreaFieldDef, AreaItem, FieldValue } from "../src/types";
import {
	buildFieldFacets,
	getFieldFacetSignature,
	hasFieldValue,
	pruneActiveFieldValues,
	toFieldFilters,
	toggleFieldValue,
} from "../src/views/area-gallery/fieldFacets";

function item(id: string, fields?: Record<string, FieldValue>): AreaItem {
	return {
		id,
		type: "image",
		vaultPath: "p.png",
		tags: [],
		addedAt: 0,
		fields,
	};
}

const statusField: AreaFieldDef = {
	id: "status",
	label: "Status",
	type: "select",
	options: ["draft", "review", "final"],
};

const ratingField: AreaFieldDef = {
	id: "rating",
	label: "Rating",
	type: "number",
};

describe("buildFieldFacets", () => {
	test("builds one facet per field, keyed by field id and labelled by field label", () => {
		const facets = buildFieldFacets(
			[item("a", { status: "draft" }), item("b", { rating: 3 })],
			[statusField, ratingField],
		);
		expect(facets.map((f) => f.key)).toEqual(["status", "rating"]);
		expect(facets.map((f) => f.label)).toEqual(["Status", "Rating"]);
	});

	test("counts each observed value", () => {
		const [facet] = buildFieldFacets(
			[
				item("a", { status: "draft" }),
				item("b", { status: "draft" }),
				item("c", { status: "final" }),
			],
			[statusField],
		);
		expect(facet?.values).toEqual([
			{ tag: "draft", label: "draft", count: 2 },
			{ tag: "final", label: "final", count: 1 },
		]);
	});

	// An empty menu is a dead button — a field nothing fills yet gets no facet.
	test("skips a field no item carries a value for", () => {
		const facets = buildFieldFacets(
			[item("a", { status: "draft" })],
			[statusField, ratingField],
		);
		expect(facets.map((f) => f.key)).toEqual(["status"]);
	});

	test("skips values that are blank", () => {
		const [facet] = buildFieldFacets(
			[item("a", { status: "  " }), item("b", { status: "final" })],
			[statusField],
		);
		expect(facet?.values.map((v) => v.tag)).toEqual(["final"]);
	});

	// The schema order carries meaning — draft precedes final in a workflow —
	// so a select facet must not be re-sorted alphabetically.
	test("a select facet follows the schema option order", () => {
		const [facet] = buildFieldFacets(
			[
				item("a", { status: "final" }),
				item("b", { status: "draft" }),
				item("c", { status: "review" }),
			],
			[statusField],
		);
		expect(facet?.values.map((v) => v.tag)).toEqual([
			"draft",
			"review",
			"final",
		]);
	});

	test("a select value outside the schema options lands at the end", () => {
		const [facet] = buildFieldFacets(
			[item("a", { status: "archived" }), item("b", { status: "draft" })],
			[statusField],
		);
		expect(facet?.values.map((v) => v.tag)).toEqual(["draft", "archived"]);
	});

	test("a number facet sorts numerically, not lexicographically", () => {
		const [facet] = buildFieldFacets(
			[item("a", { rating: 10 }), item("b", { rating: 9 })],
			[ratingField],
		);
		expect(facet?.values.map((v) => v.tag)).toEqual(["9", "10"]);
	});

	test("a text facet sorts alphabetically", () => {
		const notes: AreaFieldDef = { id: "note", label: "Note", type: "text" };
		const [facet] = buildFieldFacets(
			[item("a", { note: "wool" }), item("b", { note: "linen" })],
			[notes],
		);
		expect(facet?.values.map((v) => v.tag)).toEqual(["linen", "wool"]);
	});

	// The matcher compares normalized strings, so two spellings select the same
	// items. Listing them twice would make one entry look like it did nothing.
	test("collapses values that differ only by case or padding", () => {
		const [facet] = buildFieldFacets(
			[
				item("a", { status: "Draft" }),
				item("b", { status: "draft " }),
				item("c", { status: "DRAFT" }),
			],
			[statusField],
		);
		expect(facet?.values).toEqual([{ tag: "Draft", label: "Draft", count: 3 }]);
	});

	test("no schema means no facets", () => {
		expect(buildFieldFacets([item("a", { status: "draft" })], [])).toEqual([]);
		expect(
			buildFieldFacets([item("a", { status: "draft" })], undefined),
		).toEqual([]);
	});
});

describe("pruneActiveFieldValues", () => {
	const facets = buildFieldFacets(
		[item("a", { status: "draft" }), item("b", { status: "final" })],
		[statusField],
	);

	test("drops a selected value no item carries any more", () => {
		const active = new Map([["status", new Set(["draft", "archived"])]]);
		expect(pruneActiveFieldValues(active, facets)).toBe(true);
		expect([...(active.get("status") ?? [])]).toEqual(["draft"]);
	});

	// The field left the schema — its whole entry goes, not just its values.
	test("drops a field that no longer has a facet", () => {
		const active = new Map([["gone", new Set(["x"])]]);
		expect(pruneActiveFieldValues(active, facets)).toBe(true);
		expect(active.has("gone")).toBe(false);
	});

	test("drops a field whose last value was pruned", () => {
		const active = new Map([["status", new Set(["archived"])]]);
		pruneActiveFieldValues(active, facets);
		expect(active.has("status")).toBe(false);
	});

	test("reports false when there is nothing to prune", () => {
		const active = new Map([["status", new Set(["draft"])]]);
		expect(pruneActiveFieldValues(active, facets)).toBe(false);
		expect([...(active.get("status") ?? [])]).toEqual(["draft"]);
	});

	test("matching ignores case, like the matcher does", () => {
		const active = new Map([["status", new Set(["DRAFT"])]]);
		expect(pruneActiveFieldValues(active, facets)).toBe(false);
	});
});

describe("getFieldFacetSignature", () => {
	test("changes when a facet value appears or disappears", () => {
		const before = buildFieldFacets(
			[item("a", { status: "draft" })],
			[statusField],
		);
		const after = buildFieldFacets(
			[item("a", { status: "draft" }), item("b", { status: "final" })],
			[statusField],
		);
		expect(getFieldFacetSignature(before)).not.toBe(
			getFieldFacetSignature(after),
		);
	});

	// Counts move on every import; re-rendering the toolbar for that would tear
	// down an open menu mid-click.
	test("ignores count changes", () => {
		const one = buildFieldFacets(
			[item("a", { status: "draft" })],
			[statusField],
		);
		const two = buildFieldFacets(
			[item("a", { status: "draft" }), item("b", { status: "draft" })],
			[statusField],
		);
		expect(getFieldFacetSignature(one)).toBe(getFieldFacetSignature(two));
	});
});

describe("toFieldFilters", () => {
	test("turns each field's selected values into one is-filter", () => {
		const active = new Map([["status", new Set(["draft", "final"])]]);
		expect(toFieldFilters(active)).toEqual([
			{ fieldId: "status", operator: "is", values: ["draft", "final"] },
		]);
	});

	test("drops a field whose selection is empty", () => {
		const active = new Map([
			["status", new Set<string>()],
			["rating", new Set(["3"])],
		]);
		expect(toFieldFilters(active)).toEqual([
			{ fieldId: "rating", operator: "is", values: ["3"] },
		]);
	});

	test("no selection yields no filters", () => {
		expect(toFieldFilters(new Map())).toEqual([]);
	});
});

// The matcher and the pruner both compare case-insensitively. Selection
// membership has to agree, or a filter can be active while its row reads
// unchecked — and clicking that row adds a second spelling instead of clearing.
describe("hasFieldValue / toggleFieldValue", () => {
	test("membership ignores case and padding", () => {
		const values = new Set(["Draft"]);
		expect(hasFieldValue(values, "Draft")).toBe(true);
		expect(hasFieldValue(values, "draft")).toBe(true);
		expect(hasFieldValue(values, " DRAFT ")).toBe(true);
		expect(hasFieldValue(values, "final")).toBe(false);
	});

	test("toggling off removes the stored spelling, whatever case is clicked", () => {
		const values = new Set(["Draft"]);
		toggleFieldValue(values, "draft");
		expect([...values]).toEqual([]);
	});

	test("toggling on adds the clicked spelling", () => {
		const values = new Set<string>();
		toggleFieldValue(values, "Draft");
		expect([...values]).toEqual(["Draft"]);
	});

	test("toggling never leaves two spellings of one value", () => {
		const values = new Set(["Draft"]);
		toggleFieldValue(values, "draft");
		toggleFieldValue(values, "DRAFT");
		expect(values.size).toBe(1);
	});

	// The exact state the pruner can leave behind: it keeps a selection whose
	// case no longer matches the value the facet displays.
	test("a pruned-but-recased selection still reads as active", () => {
		const facets = buildFieldFacets([item("a", { status: "draft" })], [
			statusField,
		]);
		const active = new Map([["status", new Set(["Draft"])]]);
		expect(pruneActiveFieldValues(active, facets)).toBe(false);
		expect(hasFieldValue(active.get("status") ?? new Set(), "draft")).toBe(true);
	});
});
