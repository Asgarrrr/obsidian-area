import { describe, expect, test } from "bun:test";
import type { AreaFieldFilter, AreaItem, FieldValue } from "../src/types";
import { matchesFieldFilters } from "../src/views/area-gallery/fieldFilters";

function item(fields?: Record<string, FieldValue>): AreaItem {
	return {
		id: "id",
		type: "image",
		vaultPath: "p.png",
		tags: [],
		addedAt: 0,
		fields,
	};
}

describe("matchesFieldFilters — no filters", () => {
	test("an empty filter list matches everything", () => {
		expect(matchesFieldFilters(item(), [])).toBe(true);
		expect(matchesFieldFilters(item({ status: "draft" }), [])).toBe(true);
	});
});

describe("matchesFieldFilters — is", () => {
	const draft = item({ status: "draft" });

	test("matches the exact stored value", () => {
		const filter: AreaFieldFilter = {
			fieldId: "status",
			operator: "is",
			values: ["draft"],
		};
		expect(matchesFieldFilters(draft, [filter])).toBe(true);
	});

	test("rejects a different value", () => {
		const filter: AreaFieldFilter = {
			fieldId: "status",
			operator: "is",
			values: ["final"],
		};
		expect(matchesFieldFilters(draft, [filter])).toBe(false);
	});

	// Mirrors the tag facet rule: several values on one field widen to their
	// union, so picking a second option never returns zero.
	test("several values on one field widen to their union", () => {
		const filter: AreaFieldFilter = {
			fieldId: "status",
			operator: "is",
			values: ["final", "draft"],
		};
		expect(matchesFieldFilters(draft, [filter])).toBe(true);
	});

	test("ignores case", () => {
		const filter: AreaFieldFilter = {
			fieldId: "status",
			operator: "is",
			values: ["DRAFT"],
		};
		expect(matchesFieldFilters(draft, [filter])).toBe(true);
	});

	test("an empty value list matches nothing", () => {
		const filter: AreaFieldFilter = {
			fieldId: "status",
			operator: "is",
			values: [],
		};
		expect(matchesFieldFilters(draft, [filter])).toBe(false);
	});

	test("an item missing the field never matches", () => {
		const filter: AreaFieldFilter = {
			fieldId: "status",
			operator: "is",
			values: ["draft"],
		};
		expect(matchesFieldFilters(item(), [filter])).toBe(false);
	});

	// Hand-edited files store numbers as strings and vice versa; comparing by
	// normalized string keeps such a file filterable instead of silently empty.
	test("compares a number field across stored types", () => {
		const filter: AreaFieldFilter = {
			fieldId: "rating",
			operator: "is",
			values: [4],
		};
		expect(matchesFieldFilters(item({ rating: 4 }), [filter])).toBe(true);
		expect(matchesFieldFilters(item({ rating: "4" }), [filter])).toBe(true);
	});
});

describe("matchesFieldFilters — is-not", () => {
	test("excludes every listed value", () => {
		const filter: AreaFieldFilter = {
			fieldId: "status",
			operator: "is-not",
			values: ["draft"],
		};
		expect(matchesFieldFilters(item({ status: "draft" }), [filter])).toBe(
			false,
		);
		expect(matchesFieldFilters(item({ status: "final" }), [filter])).toBe(true);
	});

	// "not draft" is true of an item that carries no status at all.
	test("keeps an item missing the field", () => {
		const filter: AreaFieldFilter = {
			fieldId: "status",
			operator: "is-not",
			values: ["draft"],
		};
		expect(matchesFieldFilters(item(), [filter])).toBe(true);
	});
});

describe("matchesFieldFilters — contains", () => {
	const note = item({ note: "Bordeaux wool coat" });

	test("matches a substring, ignoring case", () => {
		const filter: AreaFieldFilter = {
			fieldId: "note",
			operator: "contains",
			value: "WOOL",
		};
		expect(matchesFieldFilters(note, [filter])).toBe(true);
	});

	test("rejects a substring that is absent", () => {
		const filter: AreaFieldFilter = {
			fieldId: "note",
			operator: "contains",
			value: "linen",
		};
		expect(matchesFieldFilters(note, [filter])).toBe(false);
	});

	test("an empty needle matches any item carrying the field", () => {
		const filter: AreaFieldFilter = {
			fieldId: "note",
			operator: "contains",
			value: "",
		};
		expect(matchesFieldFilters(note, [filter])).toBe(true);
		expect(matchesFieldFilters(item(), [filter])).toBe(false);
	});
});

describe("matchesFieldFilters — empty / not-empty", () => {
	const filterEmpty: AreaFieldFilter = { fieldId: "note", operator: "empty" };
	const filterNotEmpty: AreaFieldFilter = {
		fieldId: "note",
		operator: "not-empty",
	};

	test("a missing field is empty", () => {
		expect(matchesFieldFilters(item(), [filterEmpty])).toBe(true);
		expect(matchesFieldFilters(item(), [filterNotEmpty])).toBe(false);
	});

	test("a blank string is empty", () => {
		expect(matchesFieldFilters(item({ note: "   " }), [filterEmpty])).toBe(
			true,
		);
	});

	test("a filled value is not empty", () => {
		expect(matchesFieldFilters(item({ note: "wool" }), [filterEmpty])).toBe(
			false,
		);
		expect(matchesFieldFilters(item({ note: "wool" }), [filterNotEmpty])).toBe(
			true,
		);
	});

	// 0 is a real number value — treating it as empty would hide rated items.
	test("the number zero is not empty", () => {
		const zero = item({ note: 0 });
		expect(matchesFieldFilters(zero, [filterEmpty])).toBe(false);
		expect(matchesFieldFilters(zero, [filterNotEmpty])).toBe(true);
	});
});

describe("matchesFieldFilters — combining filters", () => {
	const coat = item({ status: "final", note: "wool coat", rating: 5 });

	test("filters on different fields intersect", () => {
		expect(
			matchesFieldFilters(coat, [
				{ fieldId: "status", operator: "is", values: ["final"] },
				{ fieldId: "note", operator: "contains", value: "wool" },
			]),
		).toBe(true);
	});

	test("one failing filter rejects the item", () => {
		expect(
			matchesFieldFilters(coat, [
				{ fieldId: "status", operator: "is", values: ["final"] },
				{ fieldId: "note", operator: "contains", value: "linen" },
			]),
		).toBe(false);
	});

	// Stale filters are pruned upstream by pruneActiveFieldValues; anything that
	// reaches the matcher naming an absent field simply matches nothing.
	test("a filter on a field the item has no value for rejects it", () => {
		expect(
			matchesFieldFilters(coat, [
				{ fieldId: "gone", operator: "is", values: ["x"] },
			]),
		).toBe(false);
	});
});
