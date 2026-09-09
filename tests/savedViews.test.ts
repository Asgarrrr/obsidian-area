import { describe, expect, test } from "bun:test";
import type { AreaSavedView } from "../src/types";
import {
	applySavedView,
	captureSavedView,
	isSavedViewDirty,
	normalizeSavedViews,
	removeSavedView,
	upsertSavedView,
} from "../src/views/area-gallery/savedViews";

function state(o: Partial<Parameters<typeof captureSavedView>[2]> = {}) {
	return {
		searchQuery: o.searchQuery ?? "",
		activeTagFilters: o.activeTagFilters ?? new Set<string>(),
		activeFieldValues: o.activeFieldValues ?? new Map<string, Set<string>>(),
		sort: o.sort ?? ({ type: "newest" } as const),
	};
}

describe("captureSavedView", () => {
	test("carries the search, tags, fields and sort of the moment", () => {
		const view = captureSavedView("v1", "Bordeaux drafts", {
			searchQuery: "coat",
			activeTagFilters: new Set(["palette/bordeaux"]),
			activeFieldValues: new Map([["status", new Set(["draft"])]]),
			sort: { type: "field", fieldId: "rating", direction: "desc" },
		});

		expect(view).toEqual({
			id: "v1",
			label: "Bordeaux drafts",
			filters: {
				searchQuery: "coat",
				tags: ["palette/bordeaux"],
				fields: [{ fieldId: "status", operator: "is", values: ["draft"] }],
			},
			sort: { type: "field", fieldId: "rating", direction: "desc" },
		});
	});

	// Absent keys mean "no filter on that dimension"; writing empty arrays would
	// bloat every .area file with noise that reads as state.
	test("omits the dimensions that carry no filter", () => {
		const view = captureSavedView("v1", "Everything", state());
		expect(view.filters).toEqual({});
	});

	test("trims the label", () => {
		expect(captureSavedView("v1", "  Drafts  ", state()).label).toBe("Drafts");
	});
});

describe("applySavedView", () => {
	test("round-trips a captured view back into toolbar state", () => {
		const original = state({
			searchQuery: "coat",
			activeTagFilters: new Set(["palette/bordeaux", "piece/veste"]),
			activeFieldValues: new Map([["status", new Set(["draft", "final"])]]),
			sort: { type: "title-az" },
		});
		const restored = applySavedView(captureSavedView("v1", "V", original));

		expect(restored.searchQuery).toBe("coat");
		expect([...restored.activeTagFilters].sort()).toEqual([
			"palette/bordeaux",
			"piece/veste",
		]);
		expect(
			[...(restored.activeFieldValues.get("status") ?? [])].sort(),
		).toEqual(["draft", "final"]);
		expect(restored.sort).toEqual({ type: "title-az" });
	});

	test("an empty view restores an unfiltered state", () => {
		const restored = applySavedView({ id: "v", label: "V", filters: {} });
		expect(restored.searchQuery).toBe("");
		expect(restored.activeTagFilters.size).toBe(0);
		expect(restored.activeFieldValues.size).toBe(0);
		expect(restored.sort).toEqual({ type: "newest" });
	});

	// The saved view owns the state it restores — mutating the gallery's copy
	// afterwards must not rewrite what is on disk.
	test("returns sets the caller can mutate without touching the view", () => {
		const view = captureSavedView("v1", "V", {
			...state(),
			activeTagFilters: new Set(["a"]),
		});
		const restored = applySavedView(view);
		restored.activeTagFilters.add("b");
		expect(view.filters.tags).toEqual(["a"]);
	});

	// Only `is` filters have a facet control; anything else is kept on disk but
	// cannot be shown as selected values.
	test("ignores field filters the facet UI cannot represent", () => {
		const restored = applySavedView({
			id: "v",
			label: "V",
			filters: { fields: [{ fieldId: "note", operator: "not-empty" }] },
		});
		expect(restored.activeFieldValues.size).toBe(0);
	});
});

describe("normalizeSavedViews", () => {
	const good: AreaSavedView = {
		id: "v1",
		label: "Drafts",
		filters: { tags: ["a"] },
		sort: { type: "oldest" },
	};

	test("passes a well-formed list through", () => {
		expect(normalizeSavedViews([good])).toEqual([good]);
	});

	test("an absent or non-array views key yields no views", () => {
		expect(normalizeSavedViews(undefined)).toEqual([]);
		expect(normalizeSavedViews("nope")).toEqual([]);
		expect(normalizeSavedViews({})).toEqual([]);
	});

	test("drops entries missing an id or a label", () => {
		expect(
			normalizeSavedViews([good, { label: "no id" }, { id: "no-label" }, null]),
		).toEqual([good]);
	});

	test("drops a duplicate id, keeping the first", () => {
		const clash = { ...good, label: "Later" };
		expect(normalizeSavedViews([good, clash])).toEqual([good]);
	});

	// A hand-edited file can hold anything; a broken filter block must not take
	// the whole view down with it.
	test("repairs a malformed filter block instead of dropping the view", () => {
		const [view] = normalizeSavedViews([
			{ id: "v", label: "V", filters: { tags: "not-an-array", fields: 3 } },
		]);
		expect(view).toEqual({ id: "v", label: "V", filters: {} });
	});

	test("drops non-string tags but keeps the rest", () => {
		const [view] = normalizeSavedViews([
			{ id: "v", label: "V", filters: { tags: ["a", 7, null, "b"] } },
		]);
		expect(view?.filters.tags).toEqual(["a", "b"]);
	});

	test("falls back to newest when the sort is unreadable", () => {
		const [view] = normalizeSavedViews([
			{ id: "v", label: "V", filters: {}, sort: { type: "sideways" } },
		]);
		expect(view?.sort).toBeUndefined();
	});
});

describe("upsertSavedView / removeSavedView", () => {
	const a: AreaSavedView = { id: "a", label: "A", filters: {} };
	const b: AreaSavedView = { id: "b", label: "B", filters: {} };

	test("appends a view whose id is new", () => {
		expect(upsertSavedView([a], b)).toEqual([a, b]);
	});

	test("replaces in place, holding the position", () => {
		const updated = { ...a, label: "A renamed" };
		expect(upsertSavedView([a, b], updated)).toEqual([updated, b]);
	});

	test("removes by id and leaves the others alone", () => {
		expect(removeSavedView([a, b], "a")).toEqual([b]);
		expect(removeSavedView([a, b], "missing")).toEqual([a, b]);
	});

	test("does not mutate the input list", () => {
		const views = [a];
		upsertSavedView(views, b);
		removeSavedView(views, "a");
		expect(views).toEqual([a]);
	});
});

describe("isSavedViewDirty", () => {
	const base = state({
		searchQuery: "coat",
		activeTagFilters: new Set(["a"]),
		sort: { type: "title-az" },
	});
	const view = captureSavedView("v1", "V", base);

	test("the state it was captured from is not dirty", () => {
		expect(isSavedViewDirty(view, base)).toBe(false);
	});

	test("a changed search, tag or sort is dirty", () => {
		expect(
			isSavedViewDirty(view, { ...base, searchQuery: "shirt" }),
		).toBe(true);
		expect(
			isSavedViewDirty(view, { ...base, activeTagFilters: new Set(["b"]) }),
		).toBe(true);
		expect(isSavedViewDirty(view, { ...base, sort: { type: "oldest" } })).toBe(
			true,
		);
	});

	// The label is metadata, not filter state — renaming is its own action.
	test("a different label is not dirt", () => {
		expect(isSavedViewDirty({ ...view, label: "Renamed" }, base)).toBe(false);
	});

	// Tag selection is a set: the order it was clicked in is not a change.
	test("the same tags in another order are not dirt", () => {
		const two = state({ activeTagFilters: new Set(["a", "b"]) });
		const saved = captureSavedView("v2", "V", two);
		expect(
			isSavedViewDirty(saved, {
				...two,
				activeTagFilters: new Set(["b", "a"]),
			}),
		).toBe(false);
	});

	// A stored view's key order is whatever JSON.parse produced.
	test("a stored view with reordered keys is not dirt", () => {
		const reordered = {
			sort: view.sort,
			filters: { tags: view.filters.tags, searchQuery: view.filters.searchQuery },
			label: view.label,
			id: view.id,
		} as typeof view;
		expect(isSavedViewDirty(reordered, base)).toBe(false);
	});
});
