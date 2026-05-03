# Task 07 — Styles

## Depends on

- Task 03: `AreaGalleryView` — all CSS class names are defined there
- Task 05: `ItemDetailModal` — modal class names

## Context

Replace `src/styles.css` with a complete stylesheet. Two important prerequisites from the implementation:

1. **`.area-view` is applied to `contentEl` in `AreaGalleryView.onload()`** (Task 03 does this via `this.contentEl.addClass("area-view")`). All selectors below are scoped under `.area-view` or `.area-detail` (the modal root).
2. **Scroll**: the view's `contentEl` is a fixed-height pane managed by Obsidian. The `.area-grid` must be scrollable — `contentEl` itself gets `overflow-y: auto`.

Use Obsidian CSS variables throughout. No hardcoded colors except the overlay RGBA alpha.

---

## CSS class inventory

**AreaGalleryView:**
- `.area-view` — `contentEl`, root of the view
- `.area-toolbar` — top bar
- `.area-search` — search `<input>`
- `.area-tags` — tag chip row
- `.area-tag-chip` — filter chip button; `.is-active` when selected
- `.area-grid` — CSS grid; `data-card-size` = `"s"` | `"m"` | `"l"`
- `.area-card` — single item card
- `.area-card-overlay` — hover overlay
- `.area-card-tags` — tag pills inside overlay
- `.area-tag-pill` — individual pill (used in overlay AND modal)
- `.area-card-source` — external link anchor

**ItemDetailModal:**
- `.area-detail` — modal content wrapper
- `.area-detail-image` — image section
- `.area-detail-meta` — form section
- `.area-detail-field` — labeled field row (`<label>` + input)
- `.area-detail-actions` — button row
- `.area-tag-input-wrap` — wraps existing pills + new tag input

---

## File to replace: `src/styles.css`

Write the full stylesheet. Required rules:

### Root + scroll

```css
.area-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
```

### Toolbar

```css
.area-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 0;
  flex-shrink: 0;
}

.area-search {
  width: 100%;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  padding: 6px 10px;
  color: var(--text-normal);
  font-size: var(--font-ui-small);
}
.area-search:focus-visible {
  outline: 2px solid var(--interactive-accent);
  outline-offset: -1px;
}

.area-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.area-tag-chip {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: var(--font-ui-small);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
}
.area-tag-chip:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.area-tag-chip.is-active {
  background: var(--interactive-accent);
  border-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
.area-tag-chip:focus-visible {
  outline: 2px solid var(--interactive-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .area-tag-chip { transition: none; }
}
```

### Grid

```css
.area-grid {
  --area-card-min: 180px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--area-card-min), 1fr));
  gap: 8px;
  padding: 12px;
  overflow-y: auto;
  flex: 1;
}
.area-grid[data-card-size="s"] { --area-card-min: 140px; }
.area-grid[data-card-size="m"] { --area-card-min: 180px; }
.area-grid[data-card-size="l"] { --area-card-min: 240px; }
```

### Cards

```css
.area-card {
  position: relative;
  border-radius: var(--radius-m);
  overflow: hidden;
  aspect-ratio: 1;
  cursor: pointer;
  background: var(--background-secondary);
}
.area-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.area-card-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0;
  transition: opacity 150ms ease;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 8px;
  gap: 4px;
}
.area-card:hover .area-card-overlay,
.area-card:focus-visible .area-card-overlay {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .area-card-overlay { transition: none; }
}

.area-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

/* Shared pill style — used in overlay AND modal */
.area-tag-pill {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: var(--font-ui-small);
  color: #fff;
  cursor: default;
}
/* In modal context, pills are clickable (remove action) */
.area-tag-input-wrap .area-tag-pill {
  cursor: pointer;
  background: var(--background-modifier-border);
  color: var(--text-normal);
}
.area-tag-input-wrap .area-tag-pill:hover {
  background: var(--background-modifier-error);
  color: var(--text-error);
}

.area-card-source {
  align-self: flex-end;
  width: 18px;
  height: 18px;
  opacity: 0.8;
  color: #fff;
}
.area-card-source:hover { opacity: 1; }
```

### Modal

```css
.area-detail {
  display: flex;
  gap: 20px;
  padding: 4px;
}

.area-detail-image {
  flex: 0 0 auto;
  max-width: 50%;
}
.area-detail-image img {
  max-width: 100%;
  max-height: 60vh;
  border-radius: var(--radius-m);
  object-fit: contain;
  display: block;
}

.area-detail-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.area-detail-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.area-detail-field label {
  font-size: var(--font-ui-small);
  color: var(--text-muted);
  font-weight: 500;
}
.area-detail-field input {
  width: 100%;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  padding: 5px 8px;
  color: var(--text-normal);
  font-size: var(--font-ui-small);
}
.area-detail-field input:focus-visible {
  outline: 2px solid var(--interactive-accent);
  outline-offset: -1px;
}

.area-tag-input-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 4px;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background: var(--background-secondary);
  min-height: 32px;
}
.area-tag-input-wrap input {
  border: none;
  background: transparent;
  outline: none;
  padding: 1px 4px;
  font-size: var(--font-ui-small);
  color: var(--text-normal);
  flex: 1;
  min-width: 80px;
}

.area-detail-actions {
  margin-top: auto;
}
```

---

## Verification

1. `bun run build` — `styles.css` copied to plugin root, no errors.
2. In Obsidian (light and dark theme): grid renders correctly.
3. Cards scroll when there are more items than fit the viewport.
4. Card hover → overlay appears with tag pills.
5. Active tag chip visually distinguished from inactive.
6. Modal image contained within viewport (no overflow).
7. Delete button in modal shows warning state on first click.
