import { setCustomFieldValue } from "../../fieldValues";
import { canonicalTag } from "../../tagStrings";
import type { AreaItem, FieldValue } from "../../types";

// Pure semantics of the bulk edit modal: what the selection looks like
// (summarize), how a pill reacts to a click (cycle), and what Apply does
// (patch). The modal is only a view over these functions.

export type PatchAction =
	| { action: "set"; value: FieldValue }
	| { action: "clear" };

export interface BulkPatch {
	addTags: string[];
	removeTags: string[];
	sourceUrl?: PatchAction; // absent = untouched
	fields: Record<string, PatchAction>; // absent key = untouched
}

export type PillInitial = "common" | "partial" | "new";
export type PillState = "common" | "partial" | "removed" | "new";

export interface TagPill {
	tag: string; // first-seen casing; also the casing Apply enforces
	count: number;
	total: number;
	initial: PillInitial;
	state: PillState;
}

export interface ValueSummary {
	state: "common" | "mixed" | "empty";
	value?: FieldValue; // only when common
}

export interface SelectionSummary {
	total: number;
	pills: TagPill[];
	sourceUrl: ValueSummary;
	fields: Record<string, ValueSummary>;
}

export function summarizeSelection(
	items: AreaItem[],
	fieldIds: string[],
): SelectionSummary {
	const total = items.length;

	const byKey = new Map<string, { tag: string; count: number }>();
	for (const item of items) {
		const seen = new Set<string>();
		for (const tag of item.tags) {
			const key = canonicalTag(tag);
			if (seen.has(key)) continue;
			seen.add(key);
			const entry = byKey.get(key);
			if (entry) entry.count += 1;
			else byKey.set(key, { tag, count: 1 });
		}
	}

	const pills: TagPill[] = [...byKey.values()].map(({ tag, count }) => {
		const initial: PillInitial = count === total ? "common" : "partial";
		return { tag, count, total, initial, state: initial as PillState };
	});

	const fields: Record<string, ValueSummary> = {};
	for (const id of fieldIds) {
		fields[id] = summarizeValues(items.map((item) => item.fields?.[id]));
	}

	return {
		total,
		pills,
		sourceUrl: summarizeValues(items.map((item) => item.sourceUrl)),
		fields,
	};
}

// A value missing on some items makes the field mixed even if every present
// value agrees — "common" must mean "Apply would be a no-op for this field".
function summarizeValues(values: (FieldValue | undefined)[]): ValueSummary {
	const present = values.filter(
		(value): value is FieldValue => value !== undefined && value !== "",
	);
	if (present.length === 0) return { state: "empty" };

	const first = present[0];
	if (present.length === values.length && present.every((v) => v === first)) {
		return { state: "common", value: first };
	}
	return { state: "mixed" };
}

// Body-click cycle (W3C APG mixed-state pattern): the loop always passes
// through the pill's initial state, so no click sequence is a dead end.
// Initially-common pills toggle back in one click; initially-partial pills
// walk partial → common → removed → partial, so returning to the initial
// state can take two more clicks. "new" pills don't cycle — their × deletes
// them (and a pill promoted by typing reverts in one click, handled by the
// editor, not here).
export function cyclePill(pill: TagPill): PillState {
	if (pill.initial === "new") return pill.state;

	if (pill.initial === "partial") {
		if (pill.state === "partial") return "common";
		if (pill.state === "common") return "removed";
		return "partial";
	}
	return pill.state === "common" ? "removed" : "common";
}

export function pillsToTagPatch(
	pills: TagPill[],
): Pick<BulkPatch, "addTags" | "removeTags"> {
	const addTags: string[] = [];
	const removeTags: string[] = [];
	for (const pill of pills) {
		if (pill.state === "removed") removeTags.push(pill.tag);
		else if (pill.state === "new") addTags.push(pill.tag);
		else if (pill.state === "common" && pill.initial === "partial") {
			addTags.push(pill.tag);
		}
	}
	return { addTags, removeTags };
}

export function isEmptyPatch(patch: BulkPatch): boolean {
	return (
		patch.addTags.length === 0 &&
		patch.removeTags.length === 0 &&
		patch.sourceUrl === undefined &&
		Object.keys(patch.fields).length === 0
	);
}

/**
 * Mutates the selected items in place (the caller owns save/notify) and
 * returns how many items actually changed. Adding a tag also rewrites any
 * case variant to the pill's casing: the filter layer is case-sensitive, so
 * leaving `design` on some items while adding `Design` would split facets.
 */
export function applyBulkPatch(
	items: AreaItem[],
	selectedIds: Set<string>,
	patch: BulkPatch,
): number {
	const removeKeys = new Set(patch.removeTags.map(canonicalTag));
	let changed = 0;

	for (const item of items) {
		if (!selectedIds.has(item.id)) continue;
		let touched = false;

		if (removeKeys.size > 0) {
			const kept = item.tags.filter(
				(tag) => !removeKeys.has(canonicalTag(tag)),
			);
			if (kept.length !== item.tags.length) {
				item.tags = kept;
				touched = true;
			}
		}

		for (const tag of patch.addTags) {
			const key = canonicalTag(tag);
			const at = item.tags.findIndex((t) => canonicalTag(t) === key);
			if (at === -1) {
				item.tags.push(tag);
				touched = true;
			} else if (item.tags[at] !== tag) {
				item.tags[at] = tag;
				touched = true;
			}
		}

		// An empty set-value is a clear, not a write: `""` and absent are the same
		// state everywhere else, so writing `""` would both store a dangling key
		// and count an item that did not change.
		if (patch.sourceUrl) {
			const set =
				patch.sourceUrl.action === "set"
					? String(patch.sourceUrl.value)
					: undefined;
			const next = set === "" ? undefined : set;
			if ((item.sourceUrl ?? undefined) !== next) {
				if (next === undefined) delete item.sourceUrl;
				else item.sourceUrl = next;
				touched = true;
			}
		}

		for (const [fieldId, action] of Object.entries(patch.fields)) {
			const set = action.action === "set" ? action.value : undefined;
			const next = set === "" ? undefined : set;
			if ((item.fields?.[fieldId] ?? undefined) !== next) {
				setCustomFieldValue(item, fieldId, next);
				touched = true;
			}
		}

		if (touched) changed += 1;
	}

	return changed;
}
