# Bulk edit — design

Status: approved. Branch: `feat/bulk-selection`. Follows bulk selection + bulk removal.

Edit tags, source URL, and custom fields on the current multi-selection in the
gallery view. Roadmap priority 2 (`docs/09-product-roadmap.md`).

## Overview

An "Edit selection" button joins the bulk bar between "Clear selection" and
"Remove from area". It opens `BulkEditModal`, an Obsidian `Modal`. The modal
edits a local draft; nothing mutates items before Apply. Apply commits once and
reports with a `Notice` ("Updated 12 items").

The edit applies to the whole selection, including items hidden by the current
filters. The modal states it: "N hidden by filters included".

## Tags — three-state pill cycle

The modal shows the union of the selection's tags as pills. Each pill remembers
its initial state and cycles on body click, always passing through its initial
state — a misclick is undone by clicking again (W3C APG mixed-state pattern).

- Initially partial (on some items): `partial (3/7)` greyed → `common` solid →
  `removed` struck-through in warning color → back to `partial`.
- Initially common (on all items): `common` ⇄ `removed`.
- Typed this session: rendered as a "new" pill. Its `×` deletes the pill —
  it cancels the addition and never enters `removeTags`. This is the only `×`
  in the tag editor.
- Typing a tag that case-matches an existing partial pill promotes that pill
  instead of creating a duplicate. One click reverts it to its initial state,
  so a changed mind never strips the tag from items that already had it.

The applied diff reduces to two sets: `addTags` (pills in `common` state that
were not initially common, plus typed pills) and `removeTags` (pills in
`removed` state). Untouched tags keep their per-item order. Dedup is
case-insensitive (`canonicalTag`).

Case normalization: when a tag is added or promoted, every case variant of it
on the selected items is rewritten to the pill's canonical casing. The filter
and facet layer is case-sensitive; without this rewrite, `Design`/`design`
split into two facet entries.

Suggestions come from `AreaTagSuggest` fed with the vault + area union, as in
the item detail sidebar.

A global Reset button restores the draft to its opening snapshot (tags and
fields alike).

## Source URL and custom fields — untouched / set / cleared

One input per schema field, plus Source URL. Per-field states:

- untouched (default) — nothing changes on Apply. Identical value across the
  selection → prefilled. Differing values → empty input with placeholder
  "Mixed values".
- set — a typed value, applied to every selected item.
- cleared — the value is emptied on every selected item. Reached by the
  per-field Clear button, or by emptying a prefilled input. Shown with a
  "will clear" chip on the field.

Emptying a prefilled input means clear, not untouched — bulk editors
(Lightroom) trained users to read "I deleted the text" as "clear the value".
A silent no-op there is a data-integrity trap. Every dirty field shows a
revert icon that returns it to untouched.

Field type rules:

- text / url — plain text input; url keeps `inputmode="url"`.
- number — validated with `Number()`; `3,5` or `12px` produce an inline error
  that blocks Apply. Never `parseFloat`.
- select — leading "(keep)" option for the untouched state. A stored value
  absent from the schema options is injected as a disabled-styled option
  labeled `<value> (removed from schema)` and selected by default, so the
  field never misreports state.

The modal does not reuse `renderCustomFieldInput`: its "empty means clear"
semantics conflict with the untouched state, and its select hardcodes a
leading "None". The modal renders its own inputs and shares only the section
and token helpers.

## Apply — fresh, guarded, synchronous

Apply, in order:

1. Re-read `view.getAreaData()` at apply time. Never mutate a graph captured
   at modal-open: an external reload (`setViewData`) replaces `areaData`
   wholesale, and a stale apply would mutate dead objects then save nothing.
2. Check `view.canModify()`. If the file became unreadable, abort with a
   Notice and keep the modal open.
3. Re-resolve selected ids against the current items; apply the patch to
   survivors only. Count actually-changed items.
4. Call `save()` directly — not `requestSave`. The 2-second debounce buys
   nothing after one atomic commit, and it opens last-writer-wins and
   mobile-background-kill windows.
5. `notifyItemsChanged()`, close the modal, then show the Notice with the
   changed count.

Empty diff → Apply disabled. A draft counts as dirty when the diff is
non-empty, a field holds invalid input, or the tag input holds uncommitted
text — typed content must never be discarded silently. Dirty draft + Esc or
scrim click → `ConfirmModal` "Discard changes?". A clean draft closes
silently.

Save failure: the modal stays open with the draft intact and surfaces the
error. The controller flags the unsaved write; the next apply re-saves even
if the patch is a no-op against the already-mutated memory (Notice "Changes
saved."), Obsidian's debounced save machinery is engaged as a fallback, and
closing the modal with the write still pending warns the user.

Writes to `item.fields` go through the exported `setCustomFieldValue`
invariant: delete the key when the value empties, drop the `fields` object
when it empties. Never reimplement it.

## Architecture

```
src/tagStrings.ts                    # NEW pure module: canonicalTag,
                                     #   normalizeAreaTagInput, parseTagInput,
                                     #   mergeTags — moved out of TagInput.ts,
                                     #   which re-imports them
src/views/area-gallery/bulkEdit.ts   # pure module: patch types,
                                     #   summarizeSelection(), applyBulkPatch()
src/views/BulkTagEditor.ts           # pill cycle UI; reuses renderAreaTagToken,
                                     #   AreaTagSuggest, formatAreaTag
src/views/BulkEditModal.ts           # Modal shell: layout, draft, Apply/Reset
src/views/area-gallery/bulkBar.ts    # + "Edit selection" button (onEdit)
src/views/area-gallery/selectionController.ts  # + openBulkEdit()
src/views/item-detail/detailSidebar.ts # export setCustomFieldValue
src/styles/bulk-edit.css             # NEW — must be added to STYLE_SOURCES in
                                     #   bun.build.ts or it never ships
tests/tagStrings.test.ts             # pure helpers
tests/bulkEdit.test.ts               # summarize + apply
```

Why `tagStrings.ts` exists: the helpers are module-private in `TagInput.ts`,
whose top-level imports `obsidian` symbols the test stub does not mock —
`bulkEdit.ts` importing from it would break `bun test`. The extraction keeps
`TagInput.ts` behavior identical.

`bulkEdit.ts` is pure — no DOM, no Obsidian API:

- `summarizeSelection(items)` → tag union with per-tag counts and initial
  states, plus per-field common/mixed summary. Builds on `partitionSelected`
  and the existing selection helpers.
- `applyBulkPatch(items, selectedIds, patch)` → mutated items + count of
  items actually changed. Includes the case-normalization rewrite.

The modal is a view over these two functions. `bulk-edit.css` only adds the
partial/removed/new pill variants; base pill styling stays in
`token-editors.css`.

## Known limits (accepted)

- No undo after Apply. The pill cycle and the dirty-close guard reduce
  accidents; per-item snapshots are out of scope for v1.
- Concurrent writes to the same `.area` file from another pane or device
  remain last-writer-wins. Obsidian Sync does not merge non-markdown files.
  Direct `save()` shrinks the window; it does not close it. Pre-existing
  condition, not worsened by this feature.
- No select-all in the gallery, so selections stay hand-sized. Revisit the
  pill-union rendering cost if select-all ships later.

## Testing

`bun test` (pure modules): tag union counts and initial states, case-collision
dedup, cycle-to-diff reduction (addTags/removeTags), promoted-then-reverted
producing an empty diff, case-normalization rewrite, field summaries
(common/mixed), patch application per state (untouched/set/cleared), number
validation, empty patch, vanished ids, `setCustomFieldValue` invariant.

Build + manual pass in Obsidian (repo convention for DOM/modal): pill cycle
visuals, mixed placeholder, will-clear chip, revert icons, dirty-close guard,
apply against an externally reloaded file, mobile tap targets.
