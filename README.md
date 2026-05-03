# Area

Area is an Obsidian plugin for local visual reference collections. Each collection is stored as a `.area` JSON file in the vault and opens as a gallery view for dropped or imported images.

## Features

- Create and open `.area` files from Obsidian commands.
- Drag images into a gallery, or use the **Add image to area** command.
- Browse image cards with search, tag filters, sorting, and configurable card sizes.
- Open item details to edit title, source URL, tags, attachments, and custom fields.
- Configure per-area custom fields with the schema editor.

## `.area` format

Area files are plain JSON stored in the vault:

```json
{
	"version": "1",
	"name": "Reference board",
	"schema": [],
	"items": []
}
```

Imported images are copied into the configured vault-relative attachments folder, `.attachments/area` by default. The `.area` file stores vault paths and metadata; it does not require a remote service.

## Development

Install dependencies:

```bash
bun install
```

Common commands:

| Command | Description |
| --- | --- |
| `bun run dev` | Build, watch `src/`, and hot reload the plugin when possible |
| `bun run build` | Build production `main.js` and `styles.css` at the repo root |
| `bun run dev:install <vault>` | Symlink this plugin into a vault |
| `bun run type-check` | Run TypeScript checks |
| `bun run lint` | Run Biome linting |
| `bun run lint:fix` | Apply safe Biome lint fixes |
| `bun run format` | Format source files |
| `bun run clean` | Remove build artifacts |

## Source layout

```text
src/
  main.ts                  # Plugin lifecycle and view registration
  settings.ts              # Plugin settings tab and defaults
  commands/                # User-facing commands
  views/                   # Gallery view, item detail modal, schema editor
  views/area-gallery/      # Gallery rendering/filtering helpers
  styles.css               # CSS source order manifest
  styles/                  # Split CSS sources concatenated by the build
```

Release artifacts are generated at the plugin root:

- `main.js`
- `manifest.json`
- `styles.css`

The generated `main.js` and `styles.css` are ignored by git and should be treated as build output.

## Local install

For development, link the repo into a vault:

```bash
bun run dev:install ~/path/to/Vault
bun run dev
```

Then enable **Area** in **Settings -> Community plugins**. With the Obsidian CLI enabled, the dev build reloads the plugin automatically after each successful rebuild.

## Privacy

Area is designed for local/offline use. It does not send vault contents, filenames, metadata, or analytics to external services. Source URLs are stored only when you add them to an item.
