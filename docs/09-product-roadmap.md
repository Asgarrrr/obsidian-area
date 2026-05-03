# Product roadmap — next level

## Product direction

Area should become a local visual research workspace for Obsidian, not only an image gallery.

The core workflow to optimize is:

1. Capture quickly.
2. Organize with low friction.
3. Find references again.
4. Reuse references inside notes.

Keep the plugin local-first. Do not add network behavior unless it has a clear user-facing reason, explicit consent, and documentation.

## Priority 1 — Capture experience

Make adding material to an area fast and reliable.

- Paste an image from the clipboard directly into the active area.
- Improve drag and drop with visible drop state, progress, and readable errors.
- Import images that already exist in the vault.
- Suggest the original filename as the item title.
- Detect duplicates by existing vault path, and later by a lightweight hash if needed.
- Add a command to add the current file or image to the active area.
- Preserve useful source metadata when available, without guessing or calling external services.

Why this matters: capture is the first impression. If adding references is effortless, Area becomes part of daily Obsidian use.

## Priority 2 — Views and organization

Move beyond simple tag filtering toward saved working views.

- Saved views with search, tags, schema filters, and sort order.
- Filters for custom fields, not only tags.
- Sort by custom field, title, source URL, and date.
- Inbox view for items without title, tags, or fields.
- Bulk selection.
- Bulk edit tags, source URL, custom fields, and deletion from an area.
- Quick commands such as "Show untagged", "Show missing source", and "Show recently added".

Why this matters: users should be able to maintain large reference collections without turning every organization task into item-by-item editing.

## Priority 3 — Item detail as an Obsidian object

The item detail modal should make references useful inside the rest of the vault.

- Add a Markdown notes or description field per item.
- Add copy actions:
  - Copy Markdown embed.
  - Copy item link.
  - Copy source URL.
  - Copy vault path.
- Add stable item links, for example `file.area#item-id`.
- Add previous and next navigation inside the detail modal.
- Add a proper zoom/lightbox view.
- Show backlinks or notes that reference the item when possible.
- Add keyboard shortcuts for common detail actions.

Why this matters: Area should not be a dead-end gallery. References should flow into notes, projects, and writing.

## Priority 4 — Visual and interaction polish

Make the gallery feel like a finished product.

- Use a real masonry layout or a more polished adaptive grid.
- Improve card sizing and density controls.
- Lazy-load images for large areas.
- Add a full-screen preview mode.
- Add multi-select states.
- Add strong empty states:
  - Empty area.
  - No search results.
  - No matching tags.
  - Missing attachment.
- Add keyboard flow:
  - `/` to search.
  - Arrow keys to move selection.
  - `Enter` to open detail.
  - `Esc` to close or clear.
  - Shortcuts for tag/source/edit actions.

Why this matters: visual reference tools live or die by repeated use. The interface must stay fast and pleasant under real collections.

## Priority 5 — Data integrity

Make `.area` files trustworthy.

- Validate `.area` JSON on load.
- Add clear notices for invalid files.
- Add migration helpers for future format versions.
- Add a "Repair area" command.
- Add a "Find missing attachments" command.
- Preserve unknown fields where possible.
- Avoid destructive cleanup unless the user explicitly chooses it.
- Add tests around schema IDs, schema deletion, item field persistence, imports, and serialization.

Why this matters: once users build collections, data safety becomes more important than new features.

## Priority 6 — Release readiness

Prepare the plugin for a public-quality Obsidian release.

- Add screenshots or short GIFs to the README.
- Document every command.
- Document the `.area` format with examples.
- Add a changelog.
- Keep the privacy section explicit: local/offline, no telemetry, no hidden network calls.
- Verify release artifacts:
  - `manifest.json`
  - `main.js`
  - `styles.css`
- Keep generated artifacts ignored in git unless release packaging requires otherwise.
- Add a repeatable release checklist.

Why this matters: a polished plugin needs trust before users install it into a real vault.

## Recommended build order

1. Capture improvements and duplicate handling.
2. Bulk selection and bulk edit.
3. Saved views and custom-field filters.
4. Rich item detail with Markdown notes and copy/link actions.
5. Data validation, repair tools, and tests.
6. Visual polish, screenshots, README, and release checklist.

## Highest-leverage feature set

The feature set most likely to make Area feel like a serious tool:

- Saved views.
- Bulk actions.
- Stable Markdown links to area items.
- Clipboard paste import.
- Data validation and repair.

This combination turns Area from a gallery into a practical reference-management system inside Obsidian.
