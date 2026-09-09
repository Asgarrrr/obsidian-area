# Capture gaps — closing roadmap Priority 1

Date: 2026-09-09
Status: approved (design reviewed by two independent agent passes: validation + red team)

## Context

Roadmap Priority 1 (Capture experience, `docs/09-product-roadmap.md`) is mostly
shipped: clipboard paste, drag-and-drop with a visible drop state, vault image
import, filename-derived titles, and path-based dedup all exist. Four gaps
remain:

1. No way to add a vault image to an area without the Area view being active.
2. No progress feedback during batch imports.
3. Per-file failure messages are collected (`ImportImageIssue.message`) but
   never displayed — notices show counts only.
4. `item.sourceUrl` exists but capture never fills it, even when the paste
   payload carries the origin URL.

## Scope

In: the four gaps above, a `minAppVersion` bump to `1.4.10`, roadmap
bookkeeping, and a one-line fix adding `aspectRatio` to vault-imported items.

Out (explicitly deferred, recorded in the roadmap):

- **Content-hash dedup.** Roadmap already says "later, if needed". Note:
  path-based dedup can never match externally dropped files (each gets a fresh
  UUID path), so re-dropping the same image always duplicates. Hash dedup is
  the only real fix; not this change.
- **`sourceUrl` capture on drop.** A browser image drag carries no `File`
  (the drop handler exits on the `Files` type guard), and a Finder drag
  yields `file://` URLs. Making browser drags work would require downloading
  the URL — a network call the roadmap forbids without explicit consent.
  Capture is paste-only.
- **Adding images already stored under `.attachments` (dot-folders) to
  another area.** They have no `TFile`, so neither the command nor the menus
  can see them. Cross-area copy is a separate feature.
- **Single-large-file freeze.** Progress is per-file; one 50 MP image still
  blocks on canvas work. Bounding source dimensions is out of scope.

## Feature 1 — "Add to area…" command and menus

### Entry points

- Command `area:add-file-to-area`, "Add current image to area…".
  `checkCallback`: active file is a `TFile` accepted by
  `isSupportedVaultImageFile`.
- `workspace.on("file-menu")`: menu item "Add to area…" when the file is a
  `TFile` and a supported image. Guard `instanceof TFile` — the event also
  fires for folders.
- `workspace.on("files-menu")` (multi-select in the explorer, hence the
  `minAppVersion` bump): shown when the selection contains at least one
  supported image; imports the supported subset in one invocation.

All registrations go through `plugin.registerEvent` / `addCommand`, wired from
`registerCommands`. The flow lives in a new `src/commands/addToArea.ts` —
`commands/index.ts` (186 lines) and `importController.ts` (208 lines) stay
under the 250-line limit.

### Target selection

New setting `addToAreaTarget: "ask" | "active-area"`, default `"ask"`.

- `"ask"` — a `FileSuggestModal` lists `.area` files: those present in
  `workspace.getLastOpenFiles()` first (most recent first), then the rest
  alphabetically. No new workspace listener.
- `"active-area"` — if exactly one `AreaGalleryView` is open anywhere
  (including popouts), target it directly. Zero or several open views fall
  back to the modal. (`getActiveViewOfType` is useless here: when an image is
  the active file, the active view is never the gallery.)

### Import and commit

Import reuses `importVaultImageFiles` unchanged in role: no binary copy,
thumbnail into the area's attachments dir, title from basename, path dedup.
It gains `aspectRatio` (read via `adapter.readBinary` → `Blob` →
`readAspectRatio`) so masonry lays vault imports out correctly.

Commit is a shared function used by both the command and the gallery's import
controller. Contract (aligned with the bulk-edit spec, which bans
`requestSave` for atomic external commits):

1. The target **path** is captured before any `await`. Thumbnails (the slow
   work) run first.
2. The write branch is resolved **at commit time**, not at invocation:
   - A view is open on the target path (lookup via the `findAreaGallery`
     pattern in `galleryBridge.ts`) → `canModify()` gate, dedup against fresh
     `getItems()`, unshift, direct `save()`, `notifyItemsChanged()`.
   - No view → `Vault.process(file, fn)` (atomic read-modify-write; the
     reason for `minAppVersion` ≥ 1.1.0): `parseAreaFile` inside `fn`, pure
     insert, `JSON.stringify(data, null, 2)`. A parse failure throws inside
     `fn`, nothing is written, and the user gets a readable notice.
3. Blocked or failed commit → notice, plus best-effort deletion of
   thumbnails created for the items that were not committed.

The pure core is `insertItemsIntoArea(areaFile, items) → { next, skipped }`:
dedup by `vaultPath`, insertion at the head, unknown file fields preserved.
It is `bun test`-safe and shared with the controller, which loses its inline
copy of that logic. The controller also adopts point 1: it captures
`view.file.path` before awaiting imports and commits against that path, so an
import finished after the user swapped the leaf to another `.area` file can
no longer land in the wrong area.

## Feature 2 — import progress

`importImageFiles` and `importVaultImageFiles` accept an optional
`onProgress(done, total)` callback, invoked once per processed file.

Callers show a persistent `Notice("", 0)` updated via `setMessage`
("Area: importing k/n…"). To avoid flashing on small imports, the notice
appears only when `files.length > 3`, or after an 800 ms `setTimeout`
otherwise. Both the timer (`clearTimeout`) and the notice (`hide()`) are
released in a `finally` — an import that finishes at 790 ms must not leak a
sticky zero-duration notice created at 800 ms.

Known limit (documented, not solved): progress ticks per file; a single huge
file shows no intermediate progress.

## Feature 3 — per-file failure messages

`importNotices.ts` keeps the count summary and appends failure detail: up to
3 lines `name — reason`, then `+k more`. Rules:

- Multi-line notices use the `DocumentFragment` overload of `Notice` —
  newline strings do not render as lines.
- File names are truncated (~40 chars, middle ellipsis).
- Raw error messages are sanitized: absolute paths stripped, common I/O
  errors mapped to short causes; a missing `message` falls back to
  "could not be imported".
- Only the external-file path fills `failed[].message` today; the vault path
  cannot fail past its guards. Documented, not changed.

The message-building logic (lines to display, truncation, "+k more") is a
pure function over `ImportImageResult`, tested; only the fragment assembly
touches the DOM.

## Feature 4 — `sourceUrl` capture on paste

When a paste carries both an image file and `text/html`, the origin `src` is
preserved on the created item.

- `clipboardData.getData("text/html")` is read **synchronously** in the paste
  handler, before any `await` — the `DataTransfer` is dead after the handler
  returns.
- A thin DOM step parses the HTML with `DOMParser` (never a regex) and
  returns the list of `<img>` `src` values.
- A pure, tested rule decides:
  `resolvePasteSourceUrl(srcs, fileCount) → string | undefined` — accepted
  only if there is exactly **one** `<img>` in the fragment AND exactly one
  file in the batch, and the `src` is `http(s)`. `data:` URIs, `file://`,
  `javascript:` are rejected. No `srcset`/`data-src` guessing.
- The URL flows as an optional parameter into `importImageFiles` →
  `createExternalImageItem` → `item.sourceUrl`.

Accepted limitation, on record: this is the **asset** URL, not the page URL.
It can be a CDN link that later expires. It is still the only origin metadata
available without network calls; the user can edit it in the detail view.

## Release plumbing

- `manifest.json`: `minAppVersion` → `1.4.10` (needed by `files-menu`;
  `Vault.process` needs 1.1.0). `versions.json` gains the mapping at the next
  released version.
- `docs/09-product-roadmap.md`: mark shipped Priority 1 items **Done**, add
  the deferred notes from the Scope section.

## Testing

- `tests/importImages.test.ts` extends: `sourceUrl` propagation, `onProgress`
  call counts, dedup unchanged, `aspectRatio` on vault imports.
- New pure tests: `insertItemsIntoArea` (dedup, head insertion, unknown-field
  preservation), `resolvePasteSourceUrl` (single-img rule, scheme filter),
  notice message building (truncation, "+k more", missing-message fallback).
- Pure modules must import nothing from `obsidian` beyond what
  `tests/setup.ts` stubs (`Notice`, `normalizePath`) — the DOM extraction and
  fragment assembly stay thin and are verified manually in Obsidian.
- Manual pass: command + both menus on desktop, long-press menu on mobile,
  paste from a browser (source captured), drop from Finder (no source, no
  regression), import into a closed area, import into a dirty open area,
  two rapid commands on the same closed area (atomicity), invalid `.area`
  target (readable error, no write, no orphan thumbnail).

## Delivery

Four independent commits on one branch, in this order:

1. `Add to area…` command, menus, setting, shared commit path,
   `minAppVersion` bump.
2. Import progress.
3. Per-file failure notices.
4. Paste `sourceUrl` capture.

Plus a final docs commit updating the roadmap.
