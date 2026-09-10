# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Obsidian plugin introducing a new view type — **Area** — designed to store, visualize, and retrieve design inspiration and other categorized reference material. An area is a structured, card-based gallery over vault content, distinct from standard markdown notes.

The gallery, item detail view, schema editor, import pipeline, tag facets, and bulk selection/editing are implemented. `docs/09-product-roadmap.md` tracks what is planned next.

## Commands

```bash
bun install          # install dependencies
bun run dev          # watch + rebuild + hot reload
bun run build        # production build (minified)
bun run lint         # check with Biome
bun run lint:fix     # auto-fix linting issues
bun run format       # format source files
bun run type-check   # TypeScript type check only
bun test             # unit tests
bun run dev:install <vault-path>  # symlink plugin into a vault for development
```

`bun test` runs the suite in `tests/`, which covers the pure modules only — filtering, facets, schema and file helpers. Anything touching the DOM, canvas or the Obsidian API is verified by build plus a manual pass in Obsidian, scriptable through `obsidian eval`.

## Hot Reload

`bun run dev` auto-detects reload strategy:
1. **Obsidian CLI** (preferred) — runs `obsidian plugin:reload id=<id>` after each build. Requires Obsidian 1.12+ with CLI enabled in **Settings → General → Command line interface**.
2. **WebSocket fallback** — injects a reload client into the dev bundle if the CLI is unavailable.

Check CLI availability: `obsidian --version`. Enable in Obsidian if missing.

## Architecture

```
src/
  main.ts        # Plugin class: onload, onunload, command registration only
  settings.ts    # Settings interface, defaults, SettingTab
  styles.css     # Copied to plugin root on build
bun.build.ts     # Custom Bun bundler (handles hot reload injection)
manifest.json    # Plugin metadata — never change `id` after release
versions.json    # version → minAppVersion mapping (update on each release)
```

Build output: `main.js` + `styles.css` at the repo root (required by Obsidian).

## Key Conventions

**`main.ts` stays minimal** — only lifecycle (`onload`/`onunload`) and `addCommand` calls. All feature logic goes in `src/ui/`, `src/commands/`, `src/utils/`, etc.

**File size limit** — split any file that exceeds ~250 lines.

**Listener cleanup** — always use `this.registerEvent`, `this.registerDomEvent`, `this.registerInterval` so Obsidian cleans up on unload. Never attach raw listeners.

**Settings** — persist via `this.loadData()` / `this.saveData()`. Merge with defaults using `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`.

**Command IDs** — stable once released; never rename.

**Mobile** — `isDesktopOnly: false` in manifest means mobile is in scope. Avoid Node/Electron APIs unless `isDesktopOnly` is set to `true`.

**Styles** — one file per area under `src/styles/`, listed explicitly in `bun.build.ts` and concatenated into the root `styles.css`. A new stylesheet must be added to that list or it silently never ships.

## Gotchas

**Dot-folders are invisible to the vault API.** The default attachments directory is `.attachments/area`, and Obsidian does not index any folder whose name starts with a dot. `vault.getAbstractFileByPath()` returns `null` and `vault.getFiles()` skips them, so anything needing a `TFile` (open in a tab, reveal in the file explorer) cannot work for stored images. `vault.adapter` (`list`, `readBinary`, `writeBinary`, `stat`, `getResourcePath`) sees them fine — prefer adapter calls and path-based APIs like `app.showInFolder()` for attachment work.

**Thumbnails** live at `<attachmentsDir>/.thumbs/<item.id>.webp`, downscaled to 640px on the long edge (`src/views/area-gallery/thumbnails.ts`). Generated on import, backfilled by the `area:generate-thumbnails` command, deleted with the item. Everything is best-effort: any failure returns `undefined` and cards fall back to the original, with a self-clearing `img.onerror` covering a thumbnail deleted behind the plugin's back. GIF and SVG are skipped.

**Facet filtering** groups tags by the namespace before the first `/` (`palette/bordeaux` → facet "Palette"). Selection stays a flat `Set<string>`; the semantics live in the matcher — OR within a facet, AND across facets (`src/views/area-gallery/filtering.ts`). Obsidian's `Menu` closes on every click and can't do multi-select, hence the hand-rolled popover in `facetMenu.ts`, which is a module-level singleton and must be closed via `closeFacetMenu()` whenever its anchor is destroyed.

**Custom fields reuse the tag facet UI.** `fieldFacets.ts` turns each schema field
into a `Facet` whose values are the ones items actually carry — not the schema's
options, since an option nobody picked is a dead menu row. Selection lives in a
`Map<fieldId, Set<value>>` and becomes one `is` filter per field via
`toFieldFilters`, so the OR-within / AND-across rule matches the tag side exactly.
`facetBar.ts` renders both kinds from a `FacetBinding` carrying its own
`isActive` predicate — the bar never learns where a selection is stored. Values
are compared case- and padding-insensitively in `fieldFilters.ts`, because
hand-edited files store a number field as `4` or `"4"` interchangeably; the facet
builder collapses such spellings so one entry can't look inert.

`empty` / `not-empty` / `contains` exist in the `AreaFieldFilter` model and are
tested, but nothing in the toolbar emits them yet — they are the hook for the
"Show untagged" style quick commands.

**Sort is `AreaSortState`, not a flat string.** A built-in order names itself
(`{type:"newest"}`); a field order names the field and a direction. `sortState.ts`
encodes it into the one string a `<select>` option can hold, putting the field id
last so a colon inside an id isn't read as a delimiter, and decodes tolerantly —
an unreadable order returns `newest` rather than failing a render. Ranking needs
the schema, since number-vs-text comparison comes from the field definition, not
from what happens to be stored; pass `schema` to `getFilteredItems` or a field
sort silently falls back. Items with no value sort last in **both** directions,
matching how a missing title already behaves.

**Saved views are the only toolbar state that reaches disk.** `savedViews.ts` is
pure — capture / apply / normalize / upsert / remove — and
`savedViewsController.ts` owns the selection plus every write to
`areaData.views`. All writes funnel through its private `commit()`: it re-reads
`getAreaData()` (the in-memory `AreaFile`, not disk), refuses when `canModify()`
is false, and **deletes the `views` key when the last view goes**, so an area that never had saved views stays
byte-identical. Never write `areaData.views` from anywhere else.

`normalizeSavedViews` treats the key as untrusted JSON, because it is: entries
without an id or a label are dropped, a duplicate id keeps the first, and a
broken `filters` block is emptied rather than taking its view down. `applySavedView`
returns fresh `Set`/`Map` instances — handing back the stored arrays would let a
later facet click rewrite the file through the live state.

Only `is` filters have a facet control, so `applySavedView` skips the other
operators — they have nothing to light up in the bar. Keeping them requires
feeding them back through `captureSavedView`'s `preserve` argument, which
`updateActive` does via `unrepresentableFilters`; without it, updating a
hand-written view would silently delete its operators from disk.

**Selection membership compares like the matcher does.** `hasFieldValue` /
`toggleFieldValue` in `fieldFacets.ts` are case- and padding-insensitive,
because `matchesFieldFilters` and `pruneActiveFieldValues` are. Exact `Set.has`
let a filter stay active while its row read unchecked — the pruner keeps
`"Draft"` after the facet re-cases to `"draft"` — and the clearing click added a
second spelling instead. Never reach into an `activeFieldValues` set directly.

**The saved-views menu reads its state at click time.** `hasManagedView()` is a
callback, not a captured boolean, and it is deliberately *not* `getActiveId()`:
that one goes null on drift so the picker stops lying, while updating a drifted
view is the whole point of the action.

**The saved-view select is repainted through the handle, not a re-render.**
A facet click deliberately does not rebuild the toolbar (it would destroy the
open facet menu), so `AreaGalleryView.renderGrid` calls `syncSavedViewSelection()`
next to `updateCounts` — same pattern. `isSavedViewDirty` compares a *canonical*
tuple, not the objects: key order in a stored view is whatever `JSON.parse`
returned, and tag selection is a set whose click order carries no meaning.

**Schema edits must rebuild the toolbar.** `SchemaEditorModal`'s callback used to
only `requestSave()`. Both the sort dropdown and the field facets are derived
from `areaData.schema`, so it now re-renders the toolbar and the grid too —
unconditionally, because a field added before any item fills it shifts no facet
signature, and because pruning a selection on a deleted field has to be followed
by a grid render or the board keeps showing that subset.

**Pure helper modules.** Tag string helpers (`canonicalTag`, `mergeTags`, normalization) live in `src/tagStrings.ts`; the `item.fields` write invariant is `setCustomFieldValue` in `src/fieldValues.ts`. Both are `bun test`-safe — never re-declare them inside DOM modules, and never import them from `TagInput.ts`/`detailSidebar.ts`, which pull Obsidian runtime symbols.

**Bulk edit semantics** are pure functions in `src/views/area-gallery/bulkEdit.ts` (summarize/cycle/patch/apply); the modal and its components (`BulkEditModal`, `BulkTagEditor`, `BulkFieldRows`) are views over them. Apply commits via fresh `getAreaData()` + `canModify()` + direct `save()` — keep it that way (spec: `docs/superpowers/specs/2026-09-09-bulk-edit-design.md`).

## Obsidian API Surface (relevant for this plugin)

- `ItemView` / `WorkspaceLeaf` — register custom view types (`this.registerView`)
- `TFile`, `TFolder`, `Vault` — vault file access
- `MetadataCache` — read frontmatter and tags without parsing markdown
- `MarkdownRenderer` — render markdown inside a custom view
- `Menu` — right-click context menus
- `Modal` — dialogs
- `Setting` + `PluginSettingTab` — settings UI

## Releasing

1. Bump `version` in `manifest.json` (SemVer, no leading `v`).
2. Update `versions.json` with `"<version>": "<minAppVersion>"`.
3. Create a GitHub release tagged exactly as the version string.
4. Attach `main.js`, `manifest.json`, and `styles.css` as release assets.

## Debugging

```bash
obsidian dev:console          # tail console output
obsidian devtools             # open DevTools
obsidian eval code=<js>       # run JS in Obsidian context
obsidian dev:dom selector=<css>  # inspect DOM
```
