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

export function captureSavedView(
	id: string,
	label: string,
	state: ToolbarFilterState,
): AreaSavedView {
	const filters: AreaFilterState = {};
	if (state.searchQuery !== "") filters.searchQuery = state.searchQuery;
	if (state.activeTagFilters.size > 0) {
		filters.tags = [...state.activeTagFilters];
	}
	const fields = toFieldFilters(state.activeFieldValues);
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
		searchQuery: view.filters.searchQuery ?? "",
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
		canonicalFilters(captureSavedView(view.id, view.label, state)) !==
		canonicalFilters(view)
	);
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

export function upsertSavedView(
	views: AreaSavedView[],
	view: AreaSavedView,
): AreaSavedView[] {
	const index = views.findIndex((candidate) => candidate.id === view.id);
	if (index === -1) return [...views, view];
	const next = [...views];
	next[index] = view;
	return next;
}

export function removeSavedView(
	views: AreaSavedView[],
	id: string,
): AreaSavedView[] {
	return views.filter((view) => view.id !== id);
}

function normalizeFilterState(raw: unknown): AreaFilterState {
	if (typeof raw !== "object" || raw === null) return {};
	const { searchQuery, tags, fields } = raw as Record<string, unknown>;

	const filters: AreaFilterState = {};
	if (typeof searchQuery === "string" && searchQuery !== "") {
		filters.searchQuery = searchQuery;
	}

	const cleanTags = Array.isArray(tags)
		? tags.filter((tag): tag is string => typeof tag === "string")
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
