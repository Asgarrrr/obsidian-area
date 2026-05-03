# Area Plugin — Implementation Overview

Visual reference collection plugin for Obsidian. Each "area" is a `.area` file (JSON, like `.canvas`) stored anywhere in the vault. The plugin registers a custom view handler that renders a Pinterest/Are.na-style image grid when a `.area` file is opened.

Each area defines its own optional field schema — no fixed model beyond a small core. Items store custom values in a `fields` bag keyed by schema field IDs.

## Implementation order

Each file below is a self-contained agent brief. Execute in order — later tasks depend on earlier ones.

| # | File | Produces | Depends on |
|---|---|---|---|
| 01 | [01-foundations.md](01-foundations.md) | `src/types.ts`, `src/constants.ts` | nothing |
| 02 | [02-manifest-main.md](02-manifest-main.md) | `manifest.json`, `src/main.ts`, stubs | 01 |
| 03 | [03-gallery-view.md](03-gallery-view.md) | `src/views/AreaGalleryView.ts` | 01, 02 |
| 04 | [04-commands.md](04-commands.md) | `src/commands/index.ts`, ribbon in `main.ts` | 01, 02, 03 |
| 05 | [05-item-detail-modal.md](05-item-detail-modal.md) | `src/views/ItemDetailModal.ts` | 01, 03 |
| 06 | [06-settings.md](06-settings.md) | `src/settings.ts` | 01, 02 |
| 07 | [07-styles.md](07-styles.md) | `src/styles.css` | 03, 05 |
| 08 | [08-schema-editor.md](08-schema-editor.md) | `src/views/SchemaEditorModal.ts` | 01, 03 |

Tasks 04, 05, 06, 08 can run in parallel after 03 completes. Task 07 is last.

## `.area` file format

```json
{
  "version": "1",
  "name": "UI References",
  "icon": "layout-grid",
  "color": "#6366f1",
  "schema": [
    { "id": "author",   "label": "Author",   "type": "text" },
    { "id": "priority", "label": "Priority", "type": "number" },
    { "id": "platform", "label": "Platform", "type": "select",
      "options": ["Twitter", "Dribbble", "Behance"] }
  ],
  "items": [
    {
      "id": "<uuid>",
      "type": "image",
      "vaultPath": ".attachments/area/<uuid>.png",
      "sourceUrl": "https://...",
      "tags": ["landing", "dark"],
      "addedAt": 1705363200000,
      "title": "Nice hero section",
      "fields": {
        "author": "Rauno",
        "priority": 3,
        "platform": "Dribbble"
      }
    }
  ]
}
```

**Core fields** (always present, not in schema): `id`, `type`, `vaultPath`, `addedAt`, `tags`, `sourceUrl`, `title`.

**Custom fields** (per-area, optional): anything in `schema` → stored in `item.fields`.

An area with no `schema` key works exactly the same — just no custom fields.

## End-to-end verification

1. `bun run type-check` — zero errors
2. `bun run lint` — zero warnings
3. `bun run build` — `main.js` produced
4. In Obsidian: enable plugin "Area", ribbon icon visible
5. Command "New area" → `.area` file created, empty grid visible
6. Drag & drop a PNG → appears in grid, `.area` file updated
7. Click gear icon → schema editor opens → add fields
8. Click a card → detail modal shows core fields + custom fields
9. Filter by tag → only matching items shown
10. `obsidian plugin:reload id=area` → state intact (read from file)
11. Open `.area` in a text editor → valid, readable JSON with `schema` and `fields`
