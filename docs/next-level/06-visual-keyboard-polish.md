# Visual keyboard polish

## Goal

Make the gallery and detail modal feel complete during everyday use: clear states, keyboard flow, better previewing, stronger drag/drop affordance, and responsive behavior in narrow panes.

## Current state

`AreaGalleryView` renders a simple toolbar and grid shell. `card.ts` renders lazy images and opens `ItemDetailModal`. `toolbar.ts` renders search, tag filters, sort, and schema configuration. Detail preview and metadata live in `ItemDetailModal`. Styles are split under `src/styles/`, including gallery cards, grid, toolbar, detail modal, responsive styles, and utilities.

Current code touchpoints:

- `src/views/AreaGalleryView.ts`
- `src/views/area-gallery/card.ts`
- `src/views/area-gallery/toolbar.ts`
- `src/views/ItemDetailModal.ts`
- `src/views/item-detail/actionButtons.ts`
- `src/styles/view.css`
- `src/styles/gallery-grid.css`
- `src/styles/gallery-cards.css`
- `src/styles/gallery-toolbar.css`
- `src/styles/detail-modal.css`
- `src/styles/responsive.css`

## User experience

The area should communicate state clearly:

- Empty area: invite the user to add or drop images.
- No results: explain that current filters/search match no items.
- Missing attachment: show a broken or unavailable state on the card and in detail.
- Drag/drop: show a visible active drop affordance while files are over the view.

Keyboard flow:

- `/` focuses search.
- `Esc` clears search or closes the active modal depending on context.
- `Enter` opens the selected item.
- Arrow keys move the active card selection.

Preview:

- Detail preview should be usable on desktop and narrow panes.
- A lightbox or full preview should allow larger inspection without editing metadata.

## Data model / interfaces

No `.area` schema change is required.

Add view-local UI state as needed:

- active item ID for keyboard focus
- drag/drop active state
- optional preview/lightbox open state

Keep state derived from item IDs so it survives sort/filter changes when possible.

## Implementation outline

1. Add empty and no-results rendering branches in `AreaGalleryView.renderGrid`.
2. Add a missing attachment visual state in `card.ts` by checking whether `vaultPath` resolves to a `TFile` or whether image loading fails.
3. Add drag/drop active class toggling in `AreaGalleryView` and style it in `view.css` or `gallery-grid.css`.
4. Add keyboard event registration through `this.registerDomEvent`.
5. Track an active item ID for keyboard navigation through the current filtered/sorted item list.
6. Expose search input focusing from `toolbar.ts` back to `AreaGalleryView`, or keep a stable search input reference.
7. Add ARIA labels and focus styles for card controls.
8. Add a lightbox/full preview action from detail and optionally from cards.
9. Update responsive CSS so detail preview and sidebar stack cleanly in narrow panes.
10. Check text does not overflow toolbar controls, cards, or modals.

## Edge cases

- The gallery is empty and the user presses keyboard shortcuts.
- Search is focused and arrow keys should move the cursor, not cards.
- A modal is open and view-level shortcuts should not fight modal shortcuts.
- Filter changes remove the active item from the visible list.
- Images fail to load even though the file exists.
- Narrow Obsidian panes have less width than typical mobile layouts.
- Drag leaves through child elements causing flicker.

## Test plan

- Open an empty area and confirm empty state is visible.
- Search for a non-matching query and confirm no-results state is visible.
- Temporarily point an item to a missing path and confirm card/detail missing states.
- Drag files over the view and confirm the drop affordance appears and disappears reliably.
- Press `/`, `Esc`, arrow keys, and `Enter` through common states.
- Open detail preview in desktop-width and narrow panes.
- Verify CSS changes across `default`, `compact`, and `large` card sizes if those settings exist.

## Acceptance criteria

- Empty, no-results, and missing-attachment states are visible.
- `/` focuses search.
- `Esc` clears or closes according to context.
- `Enter` opens the selected item.
- Arrow navigation works through visible cards.
- Lightbox or full preview is usable on desktop and narrow panes.
- Drag/drop affordance is clear and stable.

## Agent boundaries

Do not add new metadata features in this plan. If bulk selection or capture improvements already exist, polish their visual states but do not change their data behavior. Keep CSS scoped to Area classes.
