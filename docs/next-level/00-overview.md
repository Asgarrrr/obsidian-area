# Next-level implementation overview

## Product direction

Area should become a local visual research workspace for Obsidian. The plugin already creates `.area` files, renders image cards, supports tags, source URLs, custom fields, and item detail editing. The next wave should make those pieces feel like a daily reference-management workflow instead of a static gallery.

The product should stay focused on local visual material:

- Capture images into an active area quickly.
- Organize collections with low-friction metadata and bulk tools.
- Find references through saved views, search, tags, custom fields, and sort order.
- Reuse references in Markdown notes through stable copy/link actions.

## Target workflow

1. A user creates or opens an `.area` file.
2. They paste, drop, import, or add existing vault images without leaving the area.
3. New items land with useful defaults, including a suggested title from the filename when available.
4. The user selects multiple items to add tags, source URLs, or custom field values in one pass.
5. They save views for common working contexts such as inbox, untagged, missing source, project tags, or field-specific filters.
6. They open an item, add notes, navigate to adjacent items, and copy Markdown embeds, item links, vault paths, or source URLs into normal Obsidian notes.
7. Repair and validation tools keep data trustworthy without deleting attachments or unknown metadata.

## Recommended implementation order

1. [Capture import inbox](01-capture-import-inbox.md)
2. [Bulk selection actions](02-bulk-selection-actions.md)
3. [Saved views custom filters](03-saved-views-custom-filters.md)
4. [Item notes links copy](04-item-notes-links-copy.md)
5. [Data validation repair](05-data-validation-repair.md)
6. [Visual keyboard polish](06-visual-keyboard-polish.md)
7. [Release readiness](07-release-readiness.md)

This order prioritizes daily usage before release hardening. Capture and organization improvements should land first because they change whether Area is practical for repeated use.

## Shared constraints

- Keep Area local-first. Do not add hidden network calls, telemetry, or external lookups.
- Preserve `.area` readability with stable JSON, clear keys, and `JSON.stringify(..., null, 2)` output.
- Keep older `.area` files compatible. Optional additions should be absent-safe.
- Preserve unknown fields where possible so future or user-authored metadata is not destroyed.
- Avoid destructive cleanup. Removing an item from an area must not delete the attachment unless a future feature explicitly asks for and confirms that behavior.
- Keep `main.ts` focused on plugin lifecycle and delegate feature work to modules under `src/`.
- Use Obsidian registration helpers for events, DOM listeners, and intervals so reload/unload stays safe.
- Avoid large runtime dependencies and Node/Electron-only APIs unless `manifest.json` intentionally marks the plugin desktop-only.

## Dependency map

| Plan | Depends on | Can run independently? | Notes |
| --- | --- | --- | --- |
| [01-capture-import-inbox](01-capture-import-inbox.md) | Current `AreaItem` shape | Yes | Duplicate detection uses existing `vaultPath`; title defaults use existing optional `title`. |
| [02-bulk-selection-actions](02-bulk-selection-actions.md) | Current item IDs, tags, fields | Mostly | Can land before saved views. Should avoid changing filter data shape. |
| [03-saved-views-custom-filters](03-saved-views-custom-filters.md) | Schema/filter type additions | No | Adds optional `AreaFile.views` and shared filter/sort state. |
| [04-item-notes-links-copy](04-item-notes-links-copy.md) | Optional `AreaItem.notes` type addition | Mostly | Navigation benefits from the filtered/sorted list API from plan 03 but can pass the current list directly. |
| [05-data-validation-repair](05-data-validation-repair.md) | Finalized schema additions from plans 03 and 04 | No | Should validate `views` and `notes` after their shapes exist. |
| [06-visual-keyboard-polish](06-visual-keyboard-polish.md) | Current gallery/detail UI | Yes | Best after plans 01 and 02 so empty, drop, and selection states can be polished together. |
| [07-release-readiness](07-release-readiness.md) | Completed feature behavior | No | Documentation and privacy claims must match the actual shipped behavior. |

## Agent guidance

Each implementation plan is intended to be executable by one future agent. Start from the named code touchpoints in that plan, keep edits scoped, and update tests or manual verification notes for the behavior changed. Do not implement feature code from this overview alone; use the specific plan files.
