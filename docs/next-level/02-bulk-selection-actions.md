# Bulk selection actions

## Goal

Add multi-select mode and bulk metadata actions so users can organize many items without opening every detail modal.

## Current state

Cards are rendered in `src/views/area-gallery/card.ts` and open `ItemDetailModal` on click. The toolbar is rendered by `src/views/area-gallery/toolbar.ts` and currently owns search, tag filters, sort order, and schema configuration. Item detail editing already contains helpers for title, source URL, tags, custom fields, attachment actions, and delete-from-area behavior. Tags are edited through `src/views/TagInput.ts`.

Current code touchpoints:

- `src/views/AreaGalleryView.ts`
- `src/views/area-gallery/card.ts`
- `src/views/area-gallery/toolbar.ts`
- `src/views/ItemDetailModal.ts`
- `src/views/TagInput.ts`
- `src/views/item-detail/fieldInputs.ts`
- `src/types.ts`

## User experience

Users should be able to enter selection mode from the toolbar or by selecting cards with a checkbox. Selected cards show a clear selected state. A bulk action area appears only when the selection is non-empty and shows the selected count plus actions for tags, source URL, custom fields, and remove from area.

Clicking a card in normal mode opens detail. Clicking a card checkbox toggles selection. In selection mode, the card body may also toggle selection if that feels more efficient, but the checkbox must be the accessible control.

Destructive remove-from-area requires confirmation and must communicate that attachment files stay in the vault.

## Data model / interfaces

No `.area` schema change is required.

Add view-local state in `AreaGalleryView`:

- `selectedItemIds: Set<string>`
- derived selected visible items from `areaData.items`
- helper methods to clear, toggle, and prune selection

Bulk edits mutate existing `AreaItem` fields:

- `tags`
- `sourceUrl?`
- `fields?`

## Implementation outline

1. Add selection state to `AreaGalleryView`.
2. Pass selection options into `renderAreaCard`, including whether the item is selected, whether selection mode is active, and an `onSelectionToggle` callback.
3. Render a checkbox or icon-button selection control on every card while selection mode is active or when the item is selected.
4. Add CSS selected state in `src/styles/gallery-cards.css`.
5. Extend `renderAreaToolbar` to accept selected count and bulk action callbacks.
6. Render the bulk action area only when `selectedItemIds.size > 0`.
7. Implement bulk add/remove tags by reusing tag normalization behavior from `TagInput.ts` or extracting shared helpers if needed.
8. Implement bulk source URL set/clear with a small modal or toolbar input.
9. Implement bulk custom field set/clear for fields from `areaData.schema`, reusing `renderCustomFieldInput` where practical.
10. Implement remove-from-area by filtering `areaData.items` by selected IDs after confirmation.
11. Prune selection after data changes so deleted IDs or permanently unavailable IDs are removed.
12. Save once per bulk operation and refresh toolbar/grid.

## Edge cases

- Selection survives search, filter, and sort changes when item IDs still exist.
- Hidden selected items may still be selected after filters change; the toolbar count should make this clear or prune to visible items by deliberate product choice.
- Tags added through bulk edit may duplicate existing tags with different case.
- Clearing a custom field should delete empty `fields` objects.
- Removing selected items should not delete attachments.
- Bulk source URL should allow clear but should not validate as a network URL unless matching existing source behavior.

## Test plan

- Select and deselect cards with mouse and keyboard-accessible controls.
- Change search, tag filters, and sort order; confirm selection for remaining item IDs behaves as designed.
- Bulk add tags and confirm each selected item persists the tag once.
- Bulk clear or set source URL and confirm JSON updates.
- Bulk set and clear custom field values for text, url, number, and select fields.
- Remove selected items and confirm only area entries are removed.
- Reopen the `.area` file and confirm data persisted.

## Acceptance criteria

- Multi-select state is visible on cards.
- The toolbar action area appears only when selection is non-empty.
- Bulk edits for tags, source URL, and custom fields persist.
- Destructive bulk delete uses confirmation.
- Delete removes only area entries and not attachment files.
- Selection survives filter and sort changes when item IDs remain valid according to the chosen behavior.

## Agent boundaries

Do not add saved views or new `.area` keys in this plan. Do not change the single-item detail modal beyond extracting or reusing helpers needed for consistent bulk editing. Do not delete attachments.
