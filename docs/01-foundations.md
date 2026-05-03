# Task 01 — Foundations: types + constants

## Context

Starting point. No existing source to depend on. These two files are imported by every other module — get them right first.

Tooling: Bun, TypeScript strict, Biome linter. Run `bun run type-check` to verify.

## Files to create

### `src/types.ts`

```ts
// Custom field types supported by the schema editor
export type FieldType = "text" | "url" | "number" | "select";

// Value stored per item for a given field
export type FieldValue = string | number;

// One field definition in an area's schema
export interface AreaFieldDef {
	id: string;       // stable key — never renamed after creation
	label: string;    // display name, editable
	type: FieldType;
	options?: string[]; // only used when type === "select"
}

export interface AreaItem {
	id: string;
	type: "image" | "video";
	vaultPath: string;
	sourceUrl?: string;
	tags: string[];
	addedAt: number;
	title?: string;
	fields?: Record<string, FieldValue>; // values keyed by AreaFieldDef.id
}

export interface AreaFile {
	version: "1";
	name: string;
	icon?: string;
	color?: string;
	schema?: AreaFieldDef[]; // absent = no custom fields
	items: AreaItem[];
}
```

**Core vs custom fields:**
- Core (always present on every item): `id`, `type`, `vaultPath`, `addedAt`, `tags`, `sourceUrl`, `title`
- Custom (defined per-area, stored in `fields`): everything else — `author`, `platform`, any `number`, any `select`, etc.

An area with no `schema` works exactly like before. A field def's `id` is stable once set — renaming only changes `label`, not `id`.

### `src/constants.ts`

```ts
export const VIEW_TYPE_AREA = "area" as const;
export const FILE_EXT = "area" as const;
export const ATTACHMENTS_DIR = ".attachments/area" as const;
```

## Verification

```bash
bun run type-check
bun run lint
```

Both must pass with zero errors/warnings before this task is done.
