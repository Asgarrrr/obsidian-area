# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Obsidian plugin introducing a new view type — **Area** — designed to store, visualize, and retrieve design inspiration and other categorized reference material. The core idea: structured, card-based or gallery-style views over vault content, distinct from standard markdown notes.

Currently the codebase is a scaffolded sample plugin. The real feature work starts here.

## Commands

```bash
bun install          # install dependencies
bun run dev          # watch + rebuild + hot reload
bun run build        # production build (minified)
bun run lint         # check with Biome
bun run lint:fix     # auto-fix linting issues
bun run format       # format source files
bun run type-check   # TypeScript type check only
bun run dev:install <vault-path>  # symlink plugin into a vault for development
```

No test runner is configured. Verification = build + manual test in Obsidian.

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
