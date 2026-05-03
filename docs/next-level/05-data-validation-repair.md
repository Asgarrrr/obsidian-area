# Data validation repair

## Goal

Make `.area` files safer to open, edit, and repair. Invalid JSON should not be overwritten, unknown fields should be preserved, and repair commands should normalize only known safe issues.

## Current state

`AreaGalleryView.setViewData` parses JSON directly into `AreaFile`. On parse failure it shows `Area: could not parse file`, then still renders with the previous in-memory data. `getViewData` serializes `areaData` with `JSON.stringify(..., null, 2)`. Command registration lives in `src/commands/index.ts`. Imports create `AreaItem` objects in `src/views/area-gallery/importImages.ts`. Attachment existence checks exist in `src/views/item-detail/attachments.ts`.

Current code touchpoints:

- `src/views/AreaGalleryView.ts`
- `src/commands/index.ts`
- `src/types.ts`
- `src/views/area-gallery/importImages.ts`
- `src/views/item-detail/attachments.ts`
- `src/views/SchemaEditorModal.ts`

## User experience

When a malformed `.area` file is opened, the plugin should show a clear notice and avoid saving over it. The view should present a safe error state instead of stale or misleading data.

Users should have commands for:

- Validate current area.
- Repair current area.
- Find missing attachments.

Validation should report problems without changing files. Repair should ask for confirmation before writing and should explain that it only normalizes safe structural issues.

## Data model / interfaces

Create runtime validation helpers for `AreaFile`, `AreaItem`, schema fields, saved views, and item notes after those feature plans land.

Validation behavior:

- Invalid JSON shows a notice and does not overwrite data.
- Unknown fields are preserved.
- Missing optional keys are normalized only on save.
- Required keys should be validated enough to avoid runtime crashes.
- Repair output should be a normalized `AreaFile` plus a report of changes.

Suggested helper result:

```ts
interface AreaValidationResult {
	ok: boolean;
	file?: AreaFile;
	issues: AreaValidationIssue[];
}
```

## Implementation outline

1. Add validation helpers in a dedicated module such as `src/area-file/validation.ts`.
2. Parse JSON separately from validation so malformed files can be reported distinctly.
3. Update `setViewData` to set an explicit invalid state when parsing or validation fails.
4. Ensure `getViewData` returns original text or a safe value when the current file is invalid, so Obsidian does not overwrite malformed content with stale data.
5. Preserve unknown object keys by validating and normalizing shallowly rather than reconstructing only known fields.
6. Add a validate command in `commands/index.ts` for the active area.
7. Add a repair command that fixes safe issues such as missing `tags`, missing `items`, bad optional field containers, duplicate schema options, or invalid empty field values.
8. Add a missing attachment command that checks `AreaItem.vaultPath` through the vault adapter or `getAbstractFileByPath`.
9. Show reports in notices for small results and a modal for longer reports.
10. Add tests or documented manual checks for malformed JSON, unknown fields, and missing attachments.

## Edge cases

- A user hand-edits `.area` JSON while the view is open.
- `items` is missing, null, or not an array.
- Item IDs are missing or duplicated.
- `schema` contains duplicate field IDs.
- `fields` contains keys not present in `schema`.
- Saved views refer to deleted field IDs.
- Unknown fields exist at the file, item, schema, or view level.
- Attachments are missing, renamed, or folders are unavailable.

## Test plan

- Open malformed JSON and confirm the plugin does not overwrite it.
- Open a file with unknown keys and confirm they survive a no-op save.
- Validate a healthy file and confirm no changes are written.
- Run repair on a file with safe missing optional keys and confirm JSON normalizes.
- Run missing attachment check on present and missing vault paths.
- Reopen repaired files and confirm gallery rendering still works.

## Acceptance criteria

- Malformed files are handled safely and are not overwritten.
- Invalid JSON shows a clear notice or error state.
- Unknown fields are preserved.
- Missing optional keys are normalized only on save or explicit repair.
- Missing attachments are reported.
- Repair command can normalize known safe issues and reports what changed.

## Agent boundaries

Do not implement feature UX from capture, bulk actions, saved views, or notes in this plan. If those schemas already exist, validate them; if they do not, limit validation to the current `AreaFile` and `AreaItem` shape. Do not perform destructive cleanup.
