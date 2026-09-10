import type {
	AreaFieldFilter,
	AreaFilterState,
	AreaSavedView,
	AreaSortState,
	FieldValue,
} from "../../types";
import { toFieldFilters } from "./fieldFacets";
import { decodeSortState, encodeSortState } from "./sortState";

// Saved views are the only part of the toolbar that reaches disk. Everything
// here is pure: capture the live state, restore it, and read back whatever a
// hand-edited file happens to hold without letting it break a render.

export interface ToolbarFilterState {
	searchQuery: string;
	activeTagFilters: Set<string>;
	activeFieldValues: Map<string, Set<string>>;
	sort: AreaSortState;
}

const DEFAULT_SORT: AreaSortState = { type: "newest" };

// The facet bar can only express `is`. Anything else a stored view holds is
// passed back in through `preserve`, or updating that view would silently
// delete operators the UI simply has no control for.
export function unrepresentableFilters(view: AreaSavedView): AreaFieldFilter[] {
	return (view.filters.fields ?? []).filter(
		(filter) => filter.operator !== "is",
	);
}

export function captureSavedView(
	id: string,
	label: string,
	state: ToolbarFilterState,
	preserve: AreaFieldFilter[] = [],
): AreaSavedView {
	const filters: AreaFilterState = {};
	if (state.searchQuery !== "") filters.searchQuery = state.searchQuery;
	if (state.activeTagFilters.size > 0) {
		filters.tags = [...state.activeTagFilters];
	}
	const fields = [...toFieldFilters(state.activeFieldValues), ...preserve];
	if (fields.length > 0) filters.fields = fields;

	const view: AreaSavedView = { id, label: label.trim(), filters };
	if (state.sort.type !== "newest") view.sort = state.sort;
	return view;
}

export function applySavedView(view: AreaSavedView): ToolbarFilterState {
	const activeFieldValues = new Map<string, Set<string>>();
	for (const filter of view.filters.fields ?? []) {
		// Only `is` has a facet control. Other operators stay on disk untouched;
		// they simply have nothing to light up in the bar.
		if (filter.operator !== "is") continue;
		activeFieldValues.set(
			filter.fieldId,
			new Set(filter.values.map((value) => String(value))),
		);
	}

	return {
		// matchesSearch compares against a lowercased, trimmed query — the live
		// toolbar guarantees that, a hand-edited file does not.
		searchQuery: (view.filters.searchQuery ?? "").trim().toLowerCase(),
		// Fresh collections: the caller mutates these as the user clicks, and
		// they must not write through to the stored view.
		activeTagFilters: new Set(view.filters.tags ?? []),
		activeFieldValues,
		sort: view.sort ?? DEFAULT_SORT,
	};
}

// `views` arrives straight from JSON.parse, so every level is untrusted. A view
// missing its identity is dropped; a view with a broken filter block is kept
// and emptied, since its label is still a thing the user made.
export function normalizeSavedViews(raw: unknown): AreaSavedView[] {
	if (!Array.isArray(raw)) return [];

	const seen = new Set<string>();
	const views: AreaSavedView[] = [];

	for (const entry of raw) {
		if (typeof entry !== "object" || entry === null) continue;
		const { id, label, filters, sort } = entry as Record<string, unknown>;
		if (typeof id !== "string" || id === "") continue;
		if (typeof label !== "string" || label === "") continue;
		if (seen.has(id)) continue;
		seen.add(id);

		const view: AreaSavedView = {
			id,
			label,
			filters: normalizeFilterState(filters),
		};
		const normalizedSort = normalizeSort(sort);
		if (normalizedSort) view.sort = normalizedSort;
		views.push(view);
	}

	return views;
}

// Whether the live filters have drifted from what the view stores, so the
// picker can stop presenting a modified board as the saved one. The label is
// metadata: renaming is a separate action and must not read as a filter change.
export function isSavedViewDirty(
	view: AreaSavedView,
	state: ToolbarFilterState,
): boolean {
	return (
		canonicalFilters(
			captureSavedView(
				view.id,
				view.label,
				state,
				unrepresentableFilters(view),
			),
		) !== canonicalFilters(view)
	);
}

// The view an action like "Update this view" acts on. Deliberately blind to the
// live filters: drift must not take the target away, since updating a drifted
// view is the whole point of the action.
export function resolveManagedView(
	views: AreaSavedView[],
	activeViewId: string | null,
): AreaSavedView | undefined {
	if (activeViewId === null) return undefined;
	return views.find((view) => view.id === activeViewId);
}

// What the picker should *display* as selected. Null once the view is gone or
// the filters have drifted, so a modified board stops reading as the saved one.
export function resolveSelectedViewId(
	views: AreaSavedView[],
	activeViewId: string | null,
	state: ToolbarFilterState,
): string | null {
	const view = resolveManagedView(views, activeViewId);
	if (!view) return null;
	return isSavedViewDirty(view, state) ? null : view.id;
}

// The board as it opens, restored when the picker falls back to "no view".
// Fresh collections every call: the toolbar mutates them as the user clicks.
export function unfilteredToolbarState(): ToolbarFilterState {
	return {
		searchQuery: "",
		activeTagFilters: new Set(),
		activeFieldValues: new Map(),
		// A fresh literal, not the shared DEFAULT_SORT: everything else here is
		// handed to the toolbar to mutate, and one member that isn't would be a
		// trap the day a sort control edits in place.
		sort: { type: "newest" },
	};
}

// A positional tuple rather than the object itself: key order in a stored view
// is whatever JSON.parse handed back, and tag selection is a set, so its order
// carries no meaning either.
function canonicalFilters(view: AreaSavedView): string {
	const { searchQuery = "", tags = [], fields = [] } = view.filters;
	return JSON.stringify([
		searchQuery,
		[...tags].sort(),
		fields
			.map((filter) =>
				filter.operator === "is" || filter.operator === "is-not"
					? { ...filter, values: [...filter.values].map(String).sort() }
					: filter,
			)
			.sort((a, b) => a.fieldId.localeCompare(b.fieldId)),
		view.sort ?? DEFAULT_SORT,
	]);
}

// Both writers take the `views` key exactly as it came off disk, never the
// normalized read of it. Normalization is a read concern: writing it back would
// make editing one view rewrite every other one, stripping keys this plugin
// does not know and dropping entries a hand-edit left malformed.

// Replaces the first entry carrying the id, which is the one normalizeSavedViews
// surfaces. A hand-edited duplicate behind it survives untouched — preserving it
// is the point — so deleting the first entry later brings the stale one back.
export function upsertSavedView(raw: unknown, view: AreaSavedView): unknown[] {
	const entries = rawEntries(raw);
	const index = entries.findIndex((entry) => rawId(entry) === view.id);
	if (index === -1) return [...entries, view];
	const next = [...entries];
	next[index] = view;
	return next;
}

// Every match, not just the first: normalizeSavedViews hides a duplicate id, so
// leaving one behind would resurrect the view the user just deleted.
export function removeSavedView(raw: unknown, id: string): unknown[] {
	return rawEntries(raw).filter((entry) => rawId(entry) !== id);
}

// What the `views` key should become after a write: the mutated array, or
// undefined to drop the key. An area that never had saved views must stay
// byte-identical, so an emptied list leaves no `"views": []` behind.
//
// Only an *empty* array drops the key. Entries normalizeSavedViews would drop
// are promised to survive a neighbouring write, and that promise has to hold on
// the write that removes the last valid view too — so a file whose key also
// carries junk keeps the key, with the junk intact.
export function planSavedViewsWrite(
	raw: unknown,
	mutate: (raw: unknown) => unknown[],
): AreaSavedView[] | undefined {
	const next = mutate(raw);
	if (next.length === 0) return undefined;
	// Entries this plugin cannot parse ride along untouched, hence the cast.
	return next as AreaSavedView[];
}

// A `views` key holding anything but an array is not a list to edit.
function rawEntries(raw: unknown): unknown[] {
	return Array.isArray(raw) ? raw : [];
}

function rawId(entry: unknown): string | undefined {
	if (typeof entry !== "object" || entry === null) return undefined;
	const { id } = entry as Record<string, unknown>;
	return typeof id === "string" ? id : undefined;
}

function normalizeFilterState(raw: unknown): AreaFilterState {
	if (typeof raw !== "object" || raw === null) return {};
	const { searchQuery, tags, fields } = raw as Record<string, unknown>;

	const filters: AreaFilterState = {};
	if (typeof searchQuery === "string" && searchQuery.trim() !== "") {
		filters.searchQuery = searchQuery.trim().toLowerCase();
	}

	// De-duplicated: tag selection is a set, and a repeat would make the view
	// read as modified the instant it is applied.
	const cleanTags = Array.isArray(tags)
		? [...new Set(tags.filter((tag): tag is string => typeof tag === "string"))]
		: [];
	if (cleanTags.length > 0) filters.tags = cleanTags;

	const cleanFields = Array.isArray(fields)
		? fields
				.map(normalizeFieldFilter)
				.filter((filter): filter is AreaFieldFilter => filter !== undefined)
		: [];
	if (cleanFields.length > 0) filters.fields = cleanFields;

	return filters;
}

function normalizeFieldFilter(raw: unknown): AreaFieldFilter | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const { fieldId, operator, values, value } = raw as Record<string, unknown>;
	if (typeof fieldId !== "string" || fieldId === "") return undefined;

	if (operator === "empty" || operator === "not-empty") {
		return { fieldId, operator };
	}

	if (operator === "contains") {
		return typeof value === "string" ? { fieldId, operator, value } : undefined;
	}

	if (operator !== "is" && operator !== "is-not") return undefined;
	if (!Array.isArray(values)) return undefined;
	const clean = values.filter(
		(item): item is FieldValue =>
			typeof item === "string" || typeof item === "number",
	);
	return clean.length > 0 ? { fieldId, operator, values: clean } : undefined;
}

// Round-tripped through the encoder so an unreadable order lands on the same
// default the sort dropdown would fall back to. Returns undefined for the
// default, keeping it out of the file.
function normalizeSort(raw: unknown): AreaSortState | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const sort = decodeSortState(encodeSortState(raw as AreaSortState));
	return sort.type === "newest" ? undefined : sort;
}
