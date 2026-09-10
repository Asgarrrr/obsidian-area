import { describe, expect, test } from "bun:test";
import type { AreaSavedView } from "../src/types";
import {
	applySavedView,
	captureSavedView,
	isSavedViewDirty,
	unrepresentableFilters,
	normalizeSavedViews,
	planSavedViewsWrite,
	removeSavedView,
	resolveManagedView,
	resolveSelectedViewId,
	unfilteredToolbarState,
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

// Writes run on the stored array as it came off disk, never on the normalized
// read of it. Normalizing on the way in would make renaming one view rewrite
// every other one — stripping keys this plugin doesn't know and dropping
// entries a hand-edit left malformed.
describe("upsertSavedView / removeSavedView — raw entries", () => {
	const a: AreaSavedView = { id: "a", label: "A", filters: {} };
	const foreign = {
		id: "keep",
		label: "Keep",
		filters: {},
		pinnedBy: "another-plugin",
	};
	// normalizeSavedViews drops this one: no label. It still belongs to the user.
	const malformed = { id: "broken", filters: { tags: ["x"] } };

	test("an upsert leaves the entries it did not touch byte-identical", () => {
		const [kept] = upsertSavedView([foreign], a) as [typeof foreign];
		// Identity, not equality: a deep clone would satisfy toEqual while
		// silently rewriting the bytes this contract exists to protect.
		expect(kept).toBe(foreign);
	});

	test("an upsert keeps an entry normalizeSavedViews would drop", () => {
		expect(upsertSavedView([malformed], a)).toEqual([malformed, a]);
	});

	test("an upsert replaces the raw entry holding that id, in place", () => {
		const stale = { id: "a", label: "Stale", filters: {}, pinnedBy: "x" };
		expect(upsertSavedView([stale, foreign], a)).toEqual([a, foreign]);
	});

	test("a removal takes out every raw entry carrying that id", () => {
		const twin = { id: "a", label: "Twin", filters: {} };
		expect(removeSavedView([a, twin, foreign], "a")).toEqual([foreign]);
	});

	test("a removal leaves the neighbours byte-identical", () => {
		const [kept] = removeSavedView([a, foreign], "a") as [typeof foreign];
		expect(kept).toBe(foreign);
	});

	// A `views` key holding anything but an array is not a list to edit — the
	// write starts from nothing rather than throwing on the user's malformed file.
	test("a non-array views key counts as no views at all", () => {
		expect(upsertSavedView("nope", a)).toEqual([a]);
		expect(upsertSavedView(undefined, a)).toEqual([a]);
		expect(removeSavedView({ id: "a" }, "a")).toEqual([]);
	});

	// Raw entries can be anything JSON.parse produced; a null must not be read
	// for an id.
	test("skips raw entries that are not objects", () => {
		expect(upsertSavedView([null, 7], a)).toEqual([null, 7, a]);
		expect(removeSavedView([null, a], "a")).toEqual([null]);
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
		expect(isSavedViewDirty(view, { ...base, searchQuery: "shirt" })).toBe(
			true,
		);
		expect(
			isSavedViewDirty(view, { ...base, activeTagFilters: new Set(["b"]) }),
		).toBe(true);
		expect(isSavedViewDirty(view, { ...base, sort: { type: "oldest" } })).toBe(
			true,
		);
	});

	// The label is metadata, not filter state — renaming is its own action.
	test("a different label is not dirty", () => {
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
			filters: {
				tags: view.filters.tags,
				searchQuery: view.filters.searchQuery,
			},
			label: view.label,
			id: view.id,
		} as typeof view;
		expect(isSavedViewDirty(reordered, base)).toBe(false);
	});
});

// The invariant the whole picker rests on: restoring a view then re-capturing
// it must reproduce it. Anything that breaks this shows the view as modified
// the instant it is selected, and the obvious next click — "Update this view" —
// writes the difference to disk.
describe("round trip: apply then capture reproduces the view", () => {
	const views = normalizeSavedViews([
		{ id: "a", label: "Plain", filters: {} },
		{ id: "b", label: "Search", filters: { searchQuery: "wool" } },
		{ id: "c", label: "Tags", filters: { tags: ["x/y", "a/b"] } },
		{ id: "d", label: "Dup tags", filters: { tags: ["a", "a"] } },
		{ id: "e", label: "Upper search", filters: { searchQuery: " Wool " } },
		{
			id: "f",
			label: "Fields",
			filters: {
				fields: [{ fieldId: "s", operator: "is", values: ["draft"] }],
			},
			sort: { type: "field", fieldId: "r", direction: "desc" },
		},
		{
			id: "g",
			label: "Unrepresentable",
			filters: { fields: [{ fieldId: "n", operator: "not-empty" }] },
		},
	]);

	for (const view of views) {
		test(`"${view.label}" is not dirty right after being applied`, () => {
			expect(isSavedViewDirty(view, applySavedView(view))).toBe(false);
		});
	}
});

describe("applySavedView — search normalization", () => {
	// matchesSearch compares against a pre-lowercased, trimmed query; the live
	// toolbar guarantees that, a hand-edited file does not.
	test("lowercases and trims a hand-written query", () => {
		const restored = applySavedView({
			id: "v",
			label: "V",
			filters: { searchQuery: "  Wool  " },
		});
		expect(restored.searchQuery).toBe("wool");
	});
});

describe("normalizeSavedViews — duplicate tags", () => {
	test("collapses a tag repeated in the stored list", () => {
		const [view] = normalizeSavedViews([
			{ id: "v", label: "V", filters: { tags: ["a", "a", "b"] } },
		]);
		expect(view?.filters.tags).toEqual(["a", "b"]);
	});
});

describe("captureSavedView — preserving what the UI cannot express", () => {
	const stored: AreaSavedView = {
		id: "v",
		label: "V",
		filters: { fields: [{ fieldId: "n", operator: "not-empty" }] },
	};

	// The facet bar can only produce `is` filters. Re-capturing without the
	// others would delete them from disk on the next "Update this view".
	test("an update keeps the operators the facet bar cannot produce", () => {
		const captured = captureSavedView(
			"v",
			"V",
			applySavedView(stored),
			unrepresentableFilters(stored),
		);
		expect(captured.filters.fields).toEqual([
			{ fieldId: "n", operator: "not-empty" },
		]);
	});

	test("preserved filters sit alongside the ones the bar did produce", () => {
		const captured = captureSavedView(
			"v",
			"V",
			{
				...applySavedView(stored),
				activeFieldValues: new Map([["s", new Set(["draft"])]]),
			},
			unrepresentableFilters(stored),
		);
		expect(captured.filters.fields).toEqual([
			{ fieldId: "s", operator: "is", values: ["draft"] },
			{ fieldId: "n", operator: "not-empty" },
		]);
	});
});

// Two questions the picker asks about the same id, on purpose. "What does
// Update / Rename / Delete act on" and "what should the select show" answer
// differently the moment the live filters drift from the stored ones.
describe("resolveManagedView / resolveSelectedViewId", () => {
	const base = state({ activeTagFilters: new Set(["a"]) });
	const view = captureSavedView("v1", "V", base);
	const other: AreaSavedView = { id: "v2", label: "Other", filters: {} };
	const views = [view, other];

	test("resolves the view the id names", () => {
		expect(resolveManagedView(views, "v1")).toBe(view);
		expect(resolveSelectedViewId(views, "v1", base)).toBe("v1");
	});

	test("nothing is selected, so nothing is managed or displayed", () => {
		expect(resolveManagedView(views, null)).toBeUndefined();
		expect(resolveSelectedViewId(views, null, base)).toBeNull();
	});

	// The view can vanish under the selection — another window deleting it, or a
	// hand-edit of the file.
	test("an id no longer in the list resolves to nothing on both", () => {
		expect(resolveManagedView(views, "gone")).toBeUndefined();
		expect(resolveSelectedViewId(views, "gone", base)).toBeNull();
	});

	// The whole reason the two are separate: the picker must stop presenting a
	// modified board as the saved one, while "Update this view" still has its
	// target — updating a drifted view is exactly the point.
	test("drift clears the displayed id but keeps the managed target", () => {
		const drifted = { ...base, searchQuery: "coat" };
		expect(resolveSelectedViewId(views, "v1", drifted)).toBeNull();
		expect(resolveManagedView(views, "v1")).toBe(view);
	});
});

describe("unfilteredToolbarState", () => {
	// What selecting the "no view" entry restores: the board as it opens.
	test("is an empty search, no tags, no field values and the default sort", () => {
		const restored = unfilteredToolbarState();
		expect(restored.searchQuery).toBe("");
		expect(restored.activeTagFilters.size).toBe(0);
		expect(restored.activeFieldValues.size).toBe(0);
		expect(restored.sort).toEqual({ type: "newest" });
	});

	// The toolbar mutates what it is handed as the user clicks. A shared
	// instance would carry one board's selection into the next reset.
	test("hands back fresh collections each call, sort included", () => {
		unfilteredToolbarState().activeTagFilters.add("a");
		expect(unfilteredToolbarState().activeTagFilters.size).toBe(0);

		unfilteredToolbarState().activeFieldValues.set("s", new Set(["x"]));
		expect(unfilteredToolbarState().activeFieldValues.size).toBe(0);

		// The sort too: a shared default is the one member a future in-place
		// sort control could corrupt for every board at once.
		expect(unfilteredToolbarState().sort).not.toBe(
			unfilteredToolbarState().sort,
		);
	});
});

// What `commit()` decides once `canModify()` has let it through: the next value
// of the `views` key, or undefined to drop the key.
describe("planSavedViewsWrite", () => {
	const view: AreaSavedView = { id: "v", label: "V", filters: {} };
	// normalizeSavedViews drops this one: no label. It is still the user's data.
	const junk = { id: "broken", filters: { tags: ["x"] } };

	test("hands back the mutated list as the key's next value", () => {
		expect(
			planSavedViewsWrite(undefined, (raw) => upsertSavedView(raw, view)),
		).toEqual([view]);
	});

	// An area that never had saved views must stay byte-identical, so the last
	// removal takes the key with it rather than leaving `"views": []`.
	test("an emptied list asks for the key to be dropped", () => {
		expect(
			planSavedViewsWrite([view], (raw) => removeSavedView(raw, view.id)),
		).toBeUndefined();
	});

	// Preserving unknown data outranks tidiness. Entries normalizeSavedViews
	// would drop are promised to survive a neighbouring write; deleting the key
	// here would break that promise on the one write that empties the list.
	test("the key stays when the last valid view goes but junk remains", () => {
		expect(
			planSavedViewsWrite([junk, view], (raw) => removeSavedView(raw, view.id)),
		).toEqual([junk] as unknown as AreaSavedView[]);
	});
});
