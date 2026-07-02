# Area plugin — UI review & fix backlog

> Handoff doc. Written 2026-07-01 after a UI audit + masonry rework + an xhigh
> `/code-review` pass. Purpose: let a fresh session continue without re-deriving.
> **STATUS (updated 2026-07-01, session 2): all findings resolved.** Slices A–E
> done; #1–#8, #10, #11, #12, #13 fixed and verified (type-check + lint + build
> green, two independent review passes). Per-item status inline below.

---

## 1. What Area is

Obsidian plugin adding a custom **Area** view (`.area` files = JSON) — a
card/gallery/masonry board for design inspiration & reference images. Core files:

```
src/
  main.ts                       # lifecycle only
  constants.ts                  # VIEW_TYPE_AREA="area", FILE_EXT="area", ATTACHMENTS_DIR=".attachments/area"
  types.ts                      # AreaFile { version,name,schema?,items[] }, AreaItem { id,type,vaultPath,tags,addedAt,title?,fields? }
  settings.ts                   # cardSize (s/m/l), attachmentsDir
  views/
    AreaGalleryView.ts          # TextFileView: render/toolbar/grid + masonry wiring  ← 433 lines (over limit, see #11)
    ItemDetailModal.ts, SchemaEditorModal.ts, TagInput.ts
    area-gallery/
      card.ts                   # renderAreaCard + getDisplayTitle
      masonry.ts                # NEW — layoutCard/layoutGrid (grid-span masonry)
      toolbar.ts, filtering.ts, importImages.ts, emptyState.ts, ...
    item-detail/                # actionButtons, attachments (getFileName/getShortPath), fieldInputs, sourceActions
  styles/                       # view / gallery-toolbar / gallery-grid / gallery-cards / detail-modal / token-editors / schema-modal / utilities / responsive
                                # src/styles.css @imports them; built → /styles.css (artifact, don't edit)
```

## 2. What was done this session (already applied, verified green)

- **UI audit fixes**: motion tokens (`--area-dur`/`--area-ease` on `.area-view`),
  `:active` press states, `@media (prefers-reduced-motion)` block (utilities.css),
  pill remove-button hit-area expanders (token-editors.css), title `.trim()` in
  ItemDetailModal, `@media (hover:none)` overlay reveal + `:focus-within`.
- **Bare-tile cards**: removed the grey `--background-secondary` panel; image is a
  rounded tile in a new `.area-card-media` wrapper; overlay only built when
  tags/source exist; hover shadow **removed** (scale-only, user preference).
- **Row-major masonry** (`masonry.ts` + grid CSS): replaced CSS multi-column with
  `display:grid; grid-template-columns: repeat(auto-fill, minmax(var(--area-col-w,200px),1fr)); grid-auto-rows:1px; column-gap:8px; row-gap:0`.
  Per card `grid-row-end: span (ceil(mediaHeight+titleHeight)+8)`. Grid fills
  row-major → "Newest first" reads left-to-right. Even 8px gutters.
- **Meaningful-only captions**: `getDisplayTitle()` hides generic titles
  (== item.type, == filename, == basename); real titles show below the tile.
- **Test data**: 30 fake placeholder SVGs in `.attachments/area/fake-*.svg`,
  added to `test.area` (36 items total). See §6 to clear/regenerate.

## 3. Working-tree caveat (READ BEFORE DIFFING)

The plugin repo has ONE commit ("Initial Area plugin state"); everything is
uncommitted. The tree mixes **my session work** with **pre-existing user WIP**:

- **Pre-existing, NOT mine — leave alone**: `settings.ts` (`plugin`→`areaPlugin`
  rename), `views/item-detail/attachments.ts`, the grid→masonry migration that
  predated me, and the non-masonry parts of `AreaGalleryView.ts` (drag/paste/import).
- **Mine (the feature under review)**: `masonry.ts` (new), the masonry methods in
  `AreaGalleryView.ts`, `card.ts` (media wrapper + getDisplayTitle), all
  `styles/*.css` UI-audit + grid + bare-tile changes, `ItemDetailModal.ts` trim.

## 4. Build / verify / reload

```bash
bun run type-check     # tsc --noEmit
bun run lint           # biome
bun run build          # prod bundle → main.js + styles.css
bun run dev            # watch + rebuild (was running in background this session)
```

- **Hot reload is NOT active**: Obsidian's CLI is disabled. Enable at
  **Settings → General → Advanced → Command line interface**, then `bun run dev`
  reloads on save. Until then: `Cmd+P → "Reload app without saving"` after a build.
- No test runner. Verification = type-check + lint + build + manual in Obsidian.
- Conventions (plugin `CLAUDE.md`): files ≤ ~250 lines; use
  `registerEvent`/`registerDomEvent`/`registerInterval` — never raw listeners;
  `main.ts` stays minimal.

---

## 5. Backlog — code-review findings (xhigh pass)

Grouped into fix slices. `file:line` + concrete fix. Do slices independently.

> **✅ ALL RESOLVED (session 2).** Summary of how each was fixed:
> - **Slice A+B** — masonry orchestration extracted to a `MasonryController` class
>   in `masonry.ts`; two-pass read-then-write layout (#1); `skipNextObserverFire`
>   kills the double initial layout (#2); empty-render branch calls
>   `masonry.disconnect()` (#3); single long-lived controller + rAF cancelled on
>   disconnect (#7); `refreshCardSize` is now the settings-only relayout path (#8);
>   image listeners use a per-render `AbortController` (#12); `this.register(() =>
>   masonry.destroy())` (#13). File #11: `AreaGalleryView.ts` split — drag/paste/
>   pickers/import moved to new `area-gallery/importController.ts`; view now 248 lines.
> - **Slice C** — `stopPropagation()` on the source link (#6); source-badge hit
>   area now expands inward (`inset: -12px 0 0 -12px`) so it isn't clipped (#5).
> - **Slice D (#4)** — `computeSpan` measures real `img.offsetHeight` once
>   `img.complete`, so dimensionless SVGs / broken images no longer stick as squares.
> - **Slice E (#10)** — `AreaItem.aspectRatio` captured at external-import time via
>   `createImageBitmap` (`importImages.ts`), surfaced as `card.dataset.ar`, used by
>   masonry for a correct pre-load span (no load reflow). Vault/legacy items fall
>   back to the measured path.

### Slice A — Masonry perf + lifecycle
- **[#1 confirmed] Layout thrashing** — `masonry.ts:16`. `layoutGrid`→`layoutCard`
  interleaves reads (`offsetWidth`, `title.offsetHeight`) with writes
  (`gridRowEnd`) per card → O(N) forced reflows, N per ResizeObserver tick during
  drag-resize. **Fix**: two-pass — read column width **once**, collect each card's
  title height, then write all spans in a second loop (no read after any write).
- **[#2 confirmed] Double layout per render** — `AreaGalleryView.ts:227`.
  `setupMasonry` loops `layoutCard`, then `observe(grid)` fires the observer's
  mandatory initial callback → a 2nd full `layoutGrid`. Every keystroke/sort does
  it twice. **Fix**: wire load listeners only in the loop; let the observer's
  first callback do the initial layout (or a `firstFire` skip flag).
- **[#8 confirmed] Dead layoutGrid call** — `AreaGalleryView.ts:106`.
  `refreshCardSize()` runs `layoutGrid` but it's called inside `renderGrid` right
  after `grid.empty()` (no cards yet). **Fix**: don't relayout from
  `refreshCardSize`; trigger an explicit relayout only from the settings size-change
  path (settings.ts:43 caller).
- **[#3 confirmed] Empty-render observer leak** — `AreaGalleryView.ts:163`. The
  `items.length===0` early return skips setup/teardown; a full `render()` builds a
  new `gridEl` so the observer keeps watching the old detached grid. **Fix**:
  `teardownMasonry()` on the empty branch.
- **[#7 plausible] Shared `masonryRaf` across observers** — `AreaGalleryView.ts:222`.
  Rapid re-renders recreate the observer; a pending frame from the old observer is
  cancelled or targets a newer grid. **Fix**: falls out naturally if the observer
  isn't recreated every render (see Slice B controller), or null-check + per-observer rAF.

### Slice B — Conventions / structure (also cleans Slice A)
- **[#11 confirmed] File > 250 lines** — `AreaGalleryView.ts:433`. Plugin CLAUDE.md:
  "split any file that exceeds ~250 lines." **Fix**: move masonry orchestration
  (setup/teardown/observer/rAF) into `masonry.ts` as a small `MasonryController`
  class the view instantiates once. This also fixes #7 (one long-lived observer).
- **[#12 confirmed] Raw img listeners** — `AreaGalleryView.ts:214-215`. CLAUDE.md:
  "Never attach raw listeners." **Fix**: `this.registerDomEvent(img,"load"/"error",…)`.
  Note tension: registerDomEvent accumulates across re-renders until unload; a
  MasonryController that manages its own listener set (added/cleared per render) is
  cleaner than either. Decide in Slice B.
- **[#13 plausible] Raw ResizeObserver** — `AreaGalleryView.ts:220`. Cleaned by
  hand-written teardown, not the registry. **Fix**: `this.register(() => controller.destroy())`.

### Slice C — Source-badge bugs
- **[#6 confirmed] Source click double-action** — `card.ts:56` (pre-existing).
  Clicking `.area-card-source` (`<a target=_blank>`) opens the URL **and** bubbles
  to the card handler → detail modal opens too. **Fix**: `evt.stopPropagation()` on
  the link's click.
- **[#5 confirmed] Hit-area expander clipped** — `gallery-cards.css:102`. Moving the
  overlay into `.area-card-media {overflow:hidden}` clips the
  `.area-card-source::before {inset:-8px}` tap target on bottom/right. **Fix**:
  either move the source badge out of the clipped media, or drop the pseudo-expander
  and give the badge a real ≥32px box.

### Slice D — Robustness
- **[#4 confirmed] `naturalWidth===0` fallback is wrong for real cases** —
  `masonry.ts:24`. The "not loaded yet" branch also matches dimensionless SVGs
  (supported import type, no width/height/viewBox → naturalWidth 0 forever) and
  load-error images → permanent square span / empty column-width gap. **Fix**:
  after load/error, fall back to the element's rendered height
  (`card.getBoundingClientRect().height` with a content wrapper) instead of a square
  guess — or do Slice E which removes the guess entirely.

### Slice E — Altitude (deeper fix; obsoletes bandaids)
- **[#10 plausible] Persist image dimensions on `AreaItem`** — `masonry.ts:23`.
  Spans currently depend on runtime image load + a square estimate. **Fix**: capture
  `width`/`height` (or `aspectRatio`) at import time (`importImages.ts` —
  `importImageFiles`/`importVaultImageFiles`) and store on `AreaItem` (extend
  `types.ts`). Then `layoutCard` sets the correct span **before** load → no reflow,
  no lazy-load jump, and #4 disappears. Migration: items without dims fall back to
  the measured path.

## Suggested commit sequencing
1. **Slice A + B together** (perf two-pass + move to `MasonryController` in
   masonry.ts + registry cleanup) — biggest quality jump, fixes #1,2,3,7,8,11,12,13.
2. **Slice C** (source-badge #5,6) — small, independent.
3. **Slice D or E** — do **E** if willing to touch the import path + type (it
   supersedes D); otherwise D as a stopgap.

## Refuted — DO NOT chase (already investigated)
- **Hidden-tab 1px collapse** — self-heals: Chromium fires the ResizeObserver on
  the `display:none`→visible transition when the tab activates; lazy images don't
  load while hidden so their `{once}` load listeners still fire on show.
- **Grid item overflow from long nowrap title / needs `min-width:0`** — the title's
  `overflow:hidden` clamps its min-content to ~0, so `.area-card` never blows past
  its `minmax(200px,1fr)` track. No `min-width:0` needed.
- **Scrollbar oscillation loop** — no sustained loop; spans are deterministic per
  width, `1fr` absorbs the ~15px scrollbar delta, rAF coalesces. At most one extra
  relayout.

---

## 6. Test data (fake images)

- 30 SVGs: `.attachments/area/fake-0001.svg` … `fake-0030.svg` (varied heights
  420–940px, muted colors, numbered). Referenced by items `id: fake-*` in
  `/test.area` (vault root). Real items are the other 6.
- **Clear fakes**: delete `.attachments/area/fake-*.svg` and remove items whose
  `vaultPath` contains `/fake-` from `test.area`.
- **Regenerate**: the throwaway generator (`/tmp/gen-fakes.mjs`) was deleted; it
  read `test.area`, filtered out old fakes, wrote N SVGs + prepended items. Trivial
  to recreate (Node fs + a small SVG template) if more test data is needed.
