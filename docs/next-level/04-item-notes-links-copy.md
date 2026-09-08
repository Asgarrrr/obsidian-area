# Item notes links copy

## Goal

Make each item more useful inside Obsidian notes by adding Markdown notes, copy actions, stable item links, and previous/next navigation in the detail modal.

## Current state

`ItemDetailModal` renders the image preview, title, source URL, tags, custom fields, attachment actions, source actions, and delete-from-area. Source URL copy already exists in `src/views/item-detail/sourceActions.ts` with a clipboard fallback. Card click/open flow starts in `src/views/area-gallery/card.ts`. Attachment helpers live in `src/views/item-detail/attachments.ts`.

Current code touchpoints:

- `src/types.ts`
- `src/views/ItemDetailModal.ts`
- `src/views/area-gallery/card.ts`
- `src/views/item-detail/actionButtons.ts`
- `src/views/item-detail/sourceActions.ts`
- `src/views/item-detail/attachments.ts`
- `src/views/item-detail/fieldInputs.ts`
- `src/styles/detail-modal.css`

## User experience

The detail modal should include a Markdown notes field for the item. Notes are plain Markdown text stored in the `.area` file and edited locally.

Copy actions should include:

- Copy Markdown embed for the attachment.
- Copy item link.
- Copy vault path.
- Copy source URL.

Previous and next controls should move through the current filtered and sorted gallery order, not raw insertion order, so a filtered collection can be reviewed without closing the modal.

For v1 planning, item links should use:

```text
area://<area-path>#<item-id>
```

An implementation agent should confirm whether Obsidian exposes a better native route before shipping. If not, keep the planned format and document it as an internal Area link.

## Data model / interfaces

Add an optional field to `AreaItem`:

```ts
notes?: string;
```

Suggested helper interfaces:

- `CopyAction` helpers that all use the same clipboard fallback.
- detail navigation context with ordered item IDs and the current area file path.

The Markdown embed can use Obsidian syntax:

```md
![[path/to/image.png]]
```

The copy item link action needs the current `.area` file path. If `AreaGalleryView` can provide the backing file path, pass it into the modal.

## Implementation outline

1. Add `notes?: string` to `AreaItem` in `types.ts`.
2. Add a Markdown notes textarea to `ItemDetailModal`.
3. Save notes on change or blur, trimming only if the user clears the value. Preserve intentional Markdown whitespace inside non-empty notes.
4. Extract clipboard writing from `sourceActions.ts` into a shared helper or export it safely.
5. Add copy helpers for Markdown embed, item link, vault path, and source URL.
6. Pass area file path and current ordered item IDs from `AreaGalleryView` through `renderAreaCard` into `ItemDetailModal`.
7. Add previous/next controls to the modal and update the modal content when navigating.
8. Ensure callbacks still save data and refresh relevant card state.
9. Add notices for successful copy and clear notices for unavailable values.

## Edge cases

- The current `.area` file path is unavailable.
- Item ID is missing from the current filtered/sorted order after data changes.
- The next or previous item was removed from the area.
- Source URL is empty or invalid.
- Clipboard API is unavailable and fallback copy fails.
- Attachment file is missing; copying the vault path should still work, while embed copy should either use the stored path or warn depending on product choice.
- Notes contain Markdown links, code blocks, or leading/trailing blank lines.

## Test plan

- Add notes to an item, close and reopen the area, and confirm notes persist.
- Clear notes and confirm the `notes` key is removed or saved consistently with the implementation choice.
- Copy Markdown embed and paste it into a note.
- Copy item link and confirm it matches `area://<area-path>#<item-id>` or the chosen native route.
- Copy vault path and source URL.
- Test copy behavior when source URL is missing.
- Open a filtered/sorted gallery item and use previous/next controls.
- Remove an item and confirm navigation does not crash.

## Acceptance criteria

- Item notes persist in `.area` JSON.
- Copy Markdown embed, item link, vault path, and source URL actions work with clipboard fallback.
- Copy actions show useful notices.
- Previous/next navigation follows the current filtered and sorted order.
- Missing source URL or attachment states do not crash the modal.

## Agent boundaries

Do not implement saved views or validation repair here. Only add the minimal type and modal plumbing needed for notes, copy actions, and navigation. Do not change the planned item link format unless the implementation confirms a better Obsidian-native route.
