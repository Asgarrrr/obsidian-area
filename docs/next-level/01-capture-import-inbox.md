# Capture import inbox

## Goal

Make capture fast and predictable in the active area. Users should be able to paste images from the clipboard, drag/drop files with visible feedback, import existing vault files, and avoid duplicate area entries for the same `vaultPath`.

## Current state

`AreaGalleryView` registers drag/drop on `contentEl`, filters dropped files to `image/*`, and calls `importFiles`. `area-gallery/importImages.ts` writes each external `File` into the configured attachments directory and returns `AreaItem` objects. `commands/index.ts` has `area:add-image` for a native file picker when an `AreaGalleryView` is active. `types.ts` already has `AreaItem.title?`, `vaultPath`, `tags`, and `addedAt`.

Current code touchpoints:

- `src/views/AreaGalleryView.ts`
- `src/views/area-gallery/importImages.ts`
- `src/commands/index.ts`
- `src/types.ts`
- `src/views/area-gallery/toolbar.ts` if import controls are added to the toolbar

## User experience

When an area is active, paste should import image clipboard items into that area. Dragging files over the gallery should show an active drop state and the drop should produce a clear notice for added, skipped, or unsupported files. Importing existing vault images should use a picker or suggest modal and add references without copying bytes unless the implementation intentionally offers a copy option.

Imported items should use the original filename as a suggested title. For external files, use the selected file name without extension. For existing vault files, use the vault file basename.

Duplicates should be detected by exact `vaultPath`. If a file is already in the area, skip it and report that it was skipped.

Do not add a separate inbox flag. Inbox behavior should remain derived from item metadata, such as items with no tags, no source URL, or no custom fields, and can later be exposed through saved views.

## Data model / interfaces

No required schema change is needed for the first version.

Use existing fields:

- `AreaItem.id`: generated with `crypto.randomUUID()`.
- `AreaItem.vaultPath`: canonical duplicate key.
- `AreaItem.title?`: suggested title from original file or vault file basename.
- `AreaItem.addedAt`: import timestamp.

Consider adding small helper result types in `importImages.ts`, for example imported, skipped duplicate, and failed unsupported, so `AreaGalleryView` can show accurate notices.

## Implementation outline

1. Add a shared helper that checks whether a `vaultPath` already exists in `areaData.items`.
2. Extend `importImageFiles` so it can return useful import results, including the created item and a reason for skipped files.
3. Set `title` from the incoming filename without extension.
4. Add a paste listener in `AreaGalleryView.onload` with `this.registerDomEvent`.
5. On paste, read image `DataTransferItem` entries from `ClipboardEvent.clipboardData`, create `File` objects when needed, and call the same import path used by drops.
6. Improve drag/drop state by toggling a CSS class on drag enter/over/leave/drop and ensuring nested drag events do not flicker.
7. Add import from existing vault files through `commands/index.ts`, either as a new command or as an additional picker action. Accept image extensions that Obsidian can render.
8. For existing vault files, create `AreaItem` references directly instead of writing new attachments.
9. Show concise notices that include counts for added, skipped duplicates, and unsupported files.
10. Save and refresh only when at least one item was added.

## Edge cases

- Clipboard contains HTML, text, or files with no image data.
- A pasted image has no filename; generate a readable fallback title such as `Pasted image`.
- The attachments directory does not exist.
- A file with the generated attachment path already exists.
- Drag/drop includes mixed image and non-image files.
- Existing vault file picker selects files that are already in the area.
- Active leaf is no longer an area by the time an async import finishes.

## Test plan

- Paste one screenshot into an active area and confirm it appears, persists, and has valid JSON.
- Paste non-image clipboard content and confirm no broken item is created.
- Drop multiple image files and confirm notices report the correct count.
- Drop mixed file types and confirm unsupported files are reported or ignored with a useful notice.
- Import an existing vault image and confirm `vaultPath` points to the original file.
- Import the same existing vault image twice and confirm the second attempt is skipped.
- Reopen the `.area` file and confirm all imported items parse correctly.

## Acceptance criteria

- Clipboard paste works in the active area.
- Dropped and imported files show useful success, skipped, or error notices.
- Duplicate vault paths are skipped or reported.
- Original filenames are used as suggested titles when available.
- Imported items persist as readable, valid `.area` JSON.

## Agent boundaries

Do not implement saved views, bulk actions, notes, or validation repair as part of this plan. Keep changes focused on capture entry points and import helpers. Do not delete or modify attachment files when skipping duplicates.
