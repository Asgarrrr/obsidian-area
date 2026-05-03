# Release readiness

## Goal

Prepare Area for a repeatable public-quality release process without changing runtime behavior. Documentation, privacy claims, screenshots, changelog, and artifact verification should match what the plugin actually does.

## Current state

The project is an Obsidian community plugin with `manifest.json`, `versions.json`, Bun scripts, Biome tooling, and generated release artifacts expected at the plugin root. `README.md` exists and should be the primary user-facing documentation. The existing roadmap lists release readiness after the daily workflow features.

Current code touchpoints:

- `README.md`
- `manifest.json`
- `versions.json`
- `package.json`
- `bun.build.ts`
- `src/main.ts`
- root release artifacts: `main.js`, `styles.css`, `manifest.json`

## User experience

Prospective users should understand what Area does, what commands exist, what data is stored, and what privacy posture the plugin has before installing it into a real vault. Maintainers should have a checklist that makes releases repeatable.

The README should include screenshots or short GIFs showing the real gallery, item detail, schema fields, and import flow once those features exist.

## Data model / interfaces

No `.area` schema change is required.

Document the `.area` JSON shape in README or a dedicated docs file after the feature wave stabilizes. Include examples for:

- file metadata
- items
- schema fields
- saved views if implemented
- item notes if implemented

## Implementation outline

1. Update `README.md` with a concise product description and real usage flow.
2. Document every command from `commands/index.ts` with stable IDs and command names.
3. Add a privacy section that matches actual behavior: local/offline, no telemetry, no hidden network calls, and any explicit external behavior if it exists later.
4. Add screenshots or GIFs after UI polish is stable.
5. Add or update `CHANGELOG.md` with user-facing changes by version.
6. Verify `manifest.json` includes accurate ID, name, version, minimum app version, description, and desktop-only status.
7. Verify `versions.json` maps the manifest version to the correct minimum app version.
8. Document the release build command and expected artifacts.
9. Add a release checklist covering build, artifact inspection, version bump, tag naming without leading `v`, and GitHub release asset upload.
10. Ensure generated artifacts remain ignored unless the release workflow intentionally tracks them.

## Edge cases

- README claims a feature exists before it is implemented.
- Privacy section omits a newly added external service or link behavior.
- `manifest.json` and `versions.json` versions drift.
- Build creates artifacts in a path different from the documented release path.
- Release tag uses `v1.2.3` instead of `1.2.3`.
- Screenshots become stale after UI changes.

## Test plan

- Run the documented production build command.
- Confirm `main.js`, `manifest.json`, and `styles.css` exist where the release checklist says they should.
- Compare README command docs with `src/commands/index.ts`.
- Compare privacy claims with source code for network calls and telemetry.
- Confirm `manifest.json` version is present in `versions.json`.
- Follow the release checklist once in a dry run.

## Acceptance criteria

- README includes accurate screenshots or GIF placeholders with instructions for updating them.
- Commands are documented.
- Changelog exists or is updated.
- Privacy statement matches actual behavior.
- Release checklist is repeatable.
- Generated artifacts and required release assets are documented.
- `manifest.json` and `versions.json` are consistent.

## Agent boundaries

Do not implement feature code in this plan. Do not make release claims that are not true in the current source. If a feature is planned but not shipped, mark it as planned rather than available.
