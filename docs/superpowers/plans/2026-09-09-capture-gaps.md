# Capture Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close roadmap Priority 1 (Capture): add-to-area command/menus, import progress, per-file failure notices, paste `sourceUrl` capture.

**Architecture:** A pure partition core (`insertItems.ts`) feeds a single commit path (`commitImports.ts`) that resolves open-view vs closed-file **at commit time** — direct `save()` through the view, atomic `Vault.process` otherwise. The gallery controller and a new `addToArea` command both consume it. Progress, notices, and paste-source rules are pure modules with thin DOM/Obsidian shells.

**Tech Stack:** TypeScript, Obsidian plugin API (min 1.4.10 after this change), Bun (build + test), Biome.

**Spec:** `docs/superpowers/specs/2026-09-09-capture-gaps-design.md` — read it first; it records the red-team findings each decision answers.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/views/area-gallery/insertItems.ts` | Create | Pure: dedup partition of incoming items |
| `src/views/area-gallery/commitImports.ts` | Create | Single write path (view save / `Vault.process`), thumbnail cleanup |
| `src/views/item-detail/galleryBridge.ts` | Modify | Widen `GallerySource` with `canModify()` + `save()` |
| `src/views/area-gallery/importController.ts` | Modify | Capture path pre-await, use commit path, progress, paste source |
| `src/views/area-gallery/importImages.ts` | Modify | `options` param: `onProgress`, `sourceUrl`; vault `aspectRatio` |
| `src/views/area-gallery/importProgress.ts` | Create | Threshold-gated persistent progress Notice |
| `src/views/area-gallery/importNotices.ts` | Modify | Per-file failure lines, DocumentFragment notice |
| `src/views/area-gallery/pasteSource.ts` | Create | `<img>` src extraction (DOMParser) + pure acceptance rule |
| `src/commands/addToArea.ts` | Create | Command + `file-menu`/`files-menu` + target picking |
| `src/commands/areaOrdering.ts` | Create | Pure: recency-then-alphabetical area ordering |
| `src/commands/index.ts` | Modify | Call `registerAddToArea` |
| `src/settings.ts` | Modify | `addToAreaTarget` setting + dropdown |
| `manifest.json` | Modify | `minAppVersion` → `1.4.10` |
| `tests/setup.ts` | Modify | Add `TFile` stub |
| `tests/insertItems.test.ts` | Create | Partition rules |
| `tests/commitImports.test.ts` | Create | Both commit branches, cleanup, failure folding |
| `tests/areaOrdering.test.ts` | Create | Ordering rule |
| `tests/importNotices.test.ts` | Create | Notice lines, truncation, sanitization |
| `tests/pasteSource.test.ts` | Create | Acceptance rule |
| `tests/importImages.test.ts` | Modify | `onProgress`, `sourceUrl` propagation via fake app |
| `docs/09-product-roadmap.md`, `CLAUDE.md` | Modify | Bookkeeping + new gotcha |

Conventions that bind every task: no file over ~250 lines; comments say *why*, never *what*; pure modules may import from `obsidian` only what `tests/setup.ts` stubs; formatting belongs to the PostToolUse hook — do not hand-format.

---

### Task 1: Pure partition module

**Files:**
- Create: `src/views/area-gallery/insertItems.ts`
- Test: `tests/insertItems.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/insertItems.test.ts
import { describe, expect, test } from "bun:test";
import { partitionImportedItems } from "../src/views/area-gallery/insertItems";
import type { AreaItem } from "../src/types";

function item(vaultPath: string, title?: string): AreaItem {
	return {
		id: vaultPath,
		type: "image",
		vaultPath,
		tags: [],
		addedAt: 0,
		title,
	};
}

describe("partitionImportedItems", () => {
	test("adds items whose vaultPath is new", () => {
		const { toAdd, skipped } = partitionImportedItems(
			[item("a.png")],
			[item("b.png"), item("c.png")],
		);
		expect(toAdd.map((i) => i.vaultPath)).toEqual(["b.png", "c.png"]);
		expect(skipped).toEqual([]);
	});

	test("skips items already present by vaultPath", () => {
		const { toAdd, skipped } = partitionImportedItems(
			[item("a.png")],
			[item("a.png"), item("b.png")],
		);
		expect(toAdd.map((i) => i.vaultPath)).toEqual(["b.png"]);
		expect(skipped.map((i) => i.vaultPath)).toEqual(["a.png"]);
	});

	test("skips duplicates within the incoming batch itself", () => {
		const { toAdd, skipped } = partitionImportedItems(
			[],
			[item("a.png"), item("a.png")],
		);
		expect(toAdd.length).toBe(1);
		expect(skipped.length).toBe(1);
	});

	test("does not mutate its inputs", () => {
		const existing = [item("a.png")];
		const incoming = [item("b.png")];
		partitionImportedItems(existing, incoming);
		expect(existing.length).toBe(1);
		expect(incoming.length).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/insertItems.test.ts`
Expected: FAIL — `Cannot find module '../src/views/area-gallery/insertItems'`

- [ ] **Step 3: Write the implementation**

```ts
// src/views/area-gallery/insertItems.ts
import type { AreaItem } from "../../types";

// Pure so `bun test` can pin the dedup rule; both commit branches (open view
// and Vault.process) share it, which is what keeps their behavior identical.
export function partitionImportedItems(
	existing: AreaItem[],
	incoming: AreaItem[],
): { toAdd: AreaItem[]; skipped: AreaItem[] } {
	const seen = new Set(existing.map((item) => item.vaultPath));
	const toAdd: AreaItem[] = [];
	const skipped: AreaItem[] = [];

	for (const item of incoming) {
		if (seen.has(item.vaultPath)) {
			skipped.push(item);
			continue;
		}
		seen.add(item.vaultPath);
		toAdd.push(item);
	}

	return { toAdd, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/insertItems.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/views/area-gallery/insertItems.ts tests/insertItems.test.ts
git commit -m "feat(gallery): pure partition rule for imported items"
```

---

### Task 2: Shared commit path

**Files:**
- Create: `src/views/area-gallery/commitImports.ts`
- Modify: `src/views/item-detail/galleryBridge.ts` (widen `GallerySource`)
- Modify: `src/views/area-gallery/importController.ts` (replace `applyImportResult`)
- Modify: `tests/setup.ts` (add `TFile` stub)
- Test: `tests/commitImports.test.ts`

- [ ] **Step 1: Add `TFile` to the obsidian stub**

`commitImports` does an `instanceof TFile` check, so the stub must export the class the fake vault hands back.

```ts
// tests/setup.ts — replace the mock.module call with:
mock.module("obsidian", () => ({
	Notice: class {
		constructor(_message?: unknown) {}
	},
	normalizePath: (path: string) => path,
	TFile: class {
		path = "";
		basename = "";
		extension = "";
	},
}));
```

- [ ] **Step 2: Widen `GallerySource`**

```ts
// src/views/item-detail/galleryBridge.ts — extend the interface (rest of the
// file unchanged):
export interface GallerySource {
	file: TFile | null;
	getAreaData(): AreaFile;
	// False while the underlying file couldn't be parsed — a commit through the
	// view must refuse rather than save a phantom AreaFile.
	canModify(): boolean;
	// Direct save for atomic external commits; requestSave stays for callers
	// that batch user edits (detail view).
	save(): Promise<void>;
	requestSave(): void;
	notifyItemsChanged(): void;
}
```

`AreaGalleryView` already satisfies this (`canModify` is defined; `save` comes from `TextFileView`). No view change needed.

- [ ] **Step 3: Write the failing tests**

```ts
// tests/commitImports.test.ts
import { describe, expect, test } from "bun:test";
import { TFile, type App } from "obsidian";
import { commitImportedItems } from "../src/views/area-gallery/commitImports";
import type { ImportImageResult } from "../src/views/area-gallery/importImages";
import type { AreaFile, AreaItem } from "../src/types";
import type { GallerySource } from "../src/views/item-detail/galleryBridge";

function item(vaultPath: string, thumbPath?: string): AreaItem {
	return { id: vaultPath, type: "image", vaultPath, tags: [], addedAt: 0, thumbPath };
}

function resultWith(items: AreaItem[]): ImportImageResult {
	return { items, skippedDuplicates: [], unsupported: [], failed: [] };
}

// Fake app: a closed .area file behind Vault.process, plus adapter calls the
// thumbnail cleanup path touches.
function makeFileApp(areaFile: AreaFile) {
	const file = new TFile();
	file.path = "board.area";
	let stored = JSON.stringify(areaFile, null, 2);
	const removed: string[] = [];
	const app = {
		workspace: { getLeavesOfType: () => [] },
		vault: {
			getAbstractFileByPath: (p: string) => (p === file.path ? file : null),
			process: async (_f: unknown, fn: (d: string) => string) => {
				stored = fn(stored);
				return stored;
			},
			adapter: {
				exists: async () => true,
				remove: async (p: string) => {
					removed.push(p);
				},
			},
		},
	} as unknown as App;
	return { app, removed, parsed: () => JSON.parse(stored) as AreaFile };
}

function makeViewApp(areaFile: AreaFile, opts?: { canModify?: boolean }) {
	const saves: string[] = [];
	const removed: string[] = [];
	const gallery: GallerySource = {
		file: Object.assign(new TFile(), { path: "board.area" }) as never,
		getAreaData: () => areaFile,
		canModify: () => opts?.canModify ?? true,
		save: async () => {
			saves.push("save");
		},
		requestSave: () => {
			saves.push("requestSave");
		},
		notifyItemsChanged: () => {
			saves.push("notify");
		},
	};
	const app = {
		workspace: { getLeavesOfType: () => [{ view: gallery }] },
		vault: {
			adapter: {
				exists: async () => true,
				remove: async (p: string) => {
					removed.push(p);
				},
			},
		},
	} as unknown as App;
	return { app, saves, removed };
}

describe("commitImportedItems — closed file", () => {
	test("inserts at the head atomically and preserves unknown fields", async () => {
		const areaFile = {
			version: "1",
			name: "b",
			items: [item("old.png")],
			custom: "kept",
		} as unknown as AreaFile;
		const { app, parsed } = makeFileApp(areaFile);
		const out = await commitImportedItems(app, "board.area", resultWith([item("new.png")]));

		expect(out.items.map((i) => i.vaultPath)).toEqual(["new.png"]);
		expect(parsed().items.map((i) => i.vaultPath)).toEqual(["new.png", "old.png"]);
		expect((parsed() as unknown as { custom: string }).custom).toBe("kept");
	});

	test("dedups against the fresh file state and removes the skipped thumbnail", async () => {
		const { app, removed, parsed } = makeFileApp({
			version: "1",
			name: "b",
			items: [item("dup.png")],
		});
		const out = await commitImportedItems(
			app,
			"board.area",
			resultWith([item("dup.png", ".thumbs/dup.webp")]),
		);

		expect(out.items).toEqual([]);
		expect(out.skippedDuplicates.length).toBe(1);
		expect(parsed().items.length).toBe(1);
		expect(removed).toEqual([".thumbs/dup.webp"]);
	});

	test("an unparseable file commits nothing and folds into failed", async () => {
		const file = new TFile();
		file.path = "board.area";
		const removed: string[] = [];
		const app = {
			workspace: { getLeavesOfType: () => [] },
			vault: {
				getAbstractFileByPath: () => file,
				process: async (_f: unknown, fn: (d: string) => string) => fn("not json"),
				adapter: {
					exists: async () => true,
					remove: async (p: string) => {
						removed.push(p);
					},
				},
			},
		} as unknown as App;

		const out = await commitImportedItems(
			app,
			"board.area",
			resultWith([item("new.png", ".thumbs/new.webp")]),
		);
		expect(out.items).toEqual([]);
		expect(out.failed.length).toBe(1);
		expect(removed).toEqual([".thumbs/new.webp"]);
	});

	test("a missing file commits nothing", async () => {
		const app = {
			workspace: { getLeavesOfType: () => [] },
			vault: {
				getAbstractFileByPath: () => null,
				adapter: { exists: async () => false, remove: async () => {} },
			},
		} as unknown as App;
		const out = await commitImportedItems(app, "gone.area", resultWith([item("new.png")]));
		expect(out.items).toEqual([]);
		expect(out.failed.length).toBe(1);
	});
});

describe("commitImportedItems — open view", () => {
	test("unshifts into live items, saves directly, notifies", async () => {
		const areaFile: AreaFile = { version: "1", name: "b", items: [item("old.png")] };
		const { app, saves } = makeViewApp(areaFile);
		const out = await commitImportedItems(app, "board.area", resultWith([item("new.png")]));

		expect(areaFile.items.map((i) => i.vaultPath)).toEqual(["new.png", "old.png"]);
		expect(out.items.length).toBe(1);
		expect(saves).toEqual(["save", "notify"]);
	});

	test("a blocked view (canModify false) commits nothing and cleans thumbnails", async () => {
		const areaFile: AreaFile = { version: "1", name: "b", items: [] };
		const { app, saves, removed } = makeViewApp(areaFile, { canModify: false });
		const out = await commitImportedItems(
			app,
			"board.area",
			resultWith([item("new.png", ".thumbs/new.webp")]),
		);

		expect(areaFile.items).toEqual([]);
		expect(out.items).toEqual([]);
		expect(out.failed.length).toBe(1);
		expect(saves).toEqual([]);
		expect(removed).toEqual([".thumbs/new.webp"]);
	});

	test("a failed direct save falls back to requestSave and keeps the items", async () => {
		const areaFile: AreaFile = { version: "1", name: "b", items: [] };
		const { app, saves } = makeViewApp(areaFile);
		(app.workspace.getLeavesOfType("")[0].view as GallerySource).save = async () => {
			throw new Error("disk full");
		};
		const out = await commitImportedItems(app, "board.area", resultWith([item("new.png")]));

		expect(out.items.length).toBe(1);
		expect(areaFile.items.length).toBe(1);
		expect(saves).toEqual(["requestSave", "notify"]);
	});
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bun test tests/commitImports.test.ts`
Expected: FAIL — `Cannot find module '../src/views/area-gallery/commitImports'`

- [ ] **Step 5: Write the implementation**

```ts
// src/views/area-gallery/commitImports.ts
import { TFile, type App } from "obsidian";
import { parseAreaFile } from "../../areaFile";
import type { AreaItem } from "../../types";
import {
	findAreaGallery,
	type GallerySource,
} from "../item-detail/galleryBridge";
import type { ImportImageIssue, ImportImageResult } from "./importImages";
import { partitionImportedItems } from "./insertItems";
import { removeThumbnail } from "./thumbnails";

/**
 * Single write path for imported items. The destination is resolved at commit
 * time, not at invocation — imports await thumbnail work first, and the user
 * may have opened or closed the target meanwhile. An open gallery commits in
 * memory with a direct save() (never requestSave: its 2s debounce opens
 * last-writer-wins and background-kill windows — see the bulk-edit spec). A
 * closed file goes through Vault.process for an atomic read-modify-write.
 *
 * Items that don't land (duplicates, unwritable target) get their fresh
 * thumbnails removed; their imported binaries stay — deleting from
 * attachmentsDir on a heuristic is how user files get destroyed, and the
 * roadmap's "Find missing attachments" command is the planned sweeper.
 * The returned result reflects what actually happened so notices don't lie.
 */
export async function commitImportedItems(
	app: App,
	areaPath: string,
	result: ImportImageResult,
): Promise<ImportImageResult> {
	if (result.items.length === 0) return result;

	const gallery = findAreaGallery(app, areaPath);
	if (gallery) return commitThroughView(app, gallery, result);
	return commitThroughFile(app, areaPath, result);
}

async function commitThroughView(
	app: App,
	gallery: GallerySource,
	result: ImportImageResult,
): Promise<ImportImageResult> {
	if (!gallery.canModify()) {
		return abandonAll(app, result, "this area file is not editable");
	}

	const items = gallery.getAreaData().items;
	const { toAdd, skipped } = partitionImportedItems(items, result.items);
	items.unshift(...toAdd);

	if (toAdd.length > 0) {
		try {
			await gallery.save();
		} catch {
			// Memory already holds the new items; hand persistence to Obsidian's
			// debounced machinery rather than dropping them (bulk-edit precedent).
			gallery.requestSave();
		}
		gallery.notifyItemsChanged();
	}

	await removeThumbnails(app, skipped);
	return withOutcome(result, toAdd, skipped);
}

async function commitThroughFile(
	app: App,
	areaPath: string,
	result: ImportImageResult,
): Promise<ImportImageResult> {
	const file = app.vault.getAbstractFileByPath(areaPath);
	if (!(file instanceof TFile)) {
		return abandonAll(app, result, "area file not found");
	}

	let toAdd: AreaItem[] = [];
	let skipped: AreaItem[] = [];
	try {
		await app.vault.process(file, (data) => {
			// Parse inside the transaction: a concurrent commit changed `data`
			// since any earlier peek, and an unreadable file must throw here so
			// nothing is written.
			const areaFile = parseAreaFile(data);
			({ toAdd, skipped } = partitionImportedItems(areaFile.items, result.items));
			areaFile.items.unshift(...toAdd);
			return JSON.stringify(areaFile, null, 2);
		});
	} catch {
		return abandonAll(app, result, "this area file could not be updated");
	}

	await removeThumbnails(app, skipped);
	return withOutcome(result, toAdd, skipped);
}

async function abandonAll(
	app: App,
	result: ImportImageResult,
	reason: string,
): Promise<ImportImageResult> {
	await removeThumbnails(app, result.items);
	return {
		...result,
		items: [],
		failed: [
			...result.failed,
			...result.items.map((item) => ({ ...toIssue(item), message: reason })),
		],
	};
}

function withOutcome(
	result: ImportImageResult,
	toAdd: AreaItem[],
	skipped: AreaItem[],
): ImportImageResult {
	return {
		...result,
		items: toAdd,
		skippedDuplicates: [...result.skippedDuplicates, ...skipped.map(toIssue)],
	};
}

function toIssue(item: AreaItem): ImportImageIssue {
	return { name: item.title ?? item.vaultPath, vaultPath: item.vaultPath };
}

async function removeThumbnails(app: App, items: AreaItem[]): Promise<void> {
	for (const item of items) {
		await removeThumbnail(app, item);
	}
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test tests/commitImports.test.ts && bun test`
Expected: PASS, full suite green (the setup.ts change must not break existing tests)

- [ ] **Step 7: Switch the controller to the commit path**

In `src/views/area-gallery/importController.ts`:

Replace `importFiles` and `importVaultFiles`:

```ts
	async importFiles(files: File[]): Promise<void> {
		if (this.importsBlocked()) return;
		// Captured before any await: a long import must land in the area the
		// user dropped onto, not whatever file the leaf shows when it finishes.
		const areaPath = this.view.file?.path;
		if (!areaPath) return;

		const result = await importImageFiles(
			this.plugin.app,
			this.plugin.settings.attachmentsDir,
			files,
			this.view.getItems(),
		);
		showImportImageResultNotice(
			await commitImportedItems(this.plugin.app, areaPath, result),
		);
	}

	async importVaultFiles(files: TFile[]): Promise<void> {
		if (this.importsBlocked()) return;
		const areaPath = this.view.file?.path;
		if (!areaPath) return;

		const result = await importVaultImageFiles(
			this.plugin.app,
			this.plugin.settings.attachmentsDir,
			files,
			this.view.getItems(),
		);
		showImportImageResultNotice(
			await commitImportedItems(this.plugin.app, areaPath, result),
		);
	}
```

Delete the `applyImportResult` method and the now-unused `AreaItem` /
`hasAreaItemWithVaultPath` imports; add:

```ts
import { commitImportedItems } from "./commitImports";
```

`hasAreaItemWithVaultPath` in `importImages.ts` loses its last consumer if
`tests/importImages.test.ts` is its only remaining caller — keep the export
(the test pins it) but nothing else changes.

- [ ] **Step 8: Verify**

Run: `bun test && bun run type-check && bun run build`
Expected: all green

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(gallery): route all import commits through one atomic path

Resolves the write branch at commit time (open view -> direct save,
closed file -> Vault.process), captures the target path before any
await, and cleans up thumbnails of items that did not land."
```

---

### Task 3: Import progress

**Files:**
- Create: `src/views/area-gallery/importProgress.ts`
- Modify: `src/views/area-gallery/importImages.ts` (`onProgress` option)
- Modify: `src/views/area-gallery/importController.ts` (wire it)
- Test: `tests/importImages.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/importImages.test.ts`:

```ts
import type { App } from "obsidian";
import { importImageFiles } from "../src/views/area-gallery/importImages";

// Minimal fake App for the external-import path. createImageBitmap doesn't
// exist under bun, so aspect-ratio and thumbnail work no-op via their own
// catch paths — exactly the best-effort behavior we want here.
function makeImportApp() {
	return {
		vault: {
			createBinary: async (_path: string, _data: ArrayBuffer) => {},
			adapter: {
				exists: async () => false,
				mkdir: async () => {},
				readBinary: async () => new ArrayBuffer(8),
				writeBinary: async () => {},
			},
		},
	} as unknown as App;
}

describe("importImageFiles options", () => {
	test("onProgress ticks once per file, supported or not", async () => {
		const calls: Array<[number, number]> = [];
		await importImageFiles(
			makeImportApp(),
			"attachments",
			[
				new File([new Uint8Array(4)], "a.png", { type: "image/png" }),
				new File([new Uint8Array(4)], "not-an-image.txt", { type: "text/plain" }),
			],
			[],
			{ onProgress: (done, total) => calls.push([done, total]) },
		);
		expect(calls).toEqual([
			[1, 2],
			[2, 2],
		]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/importImages.test.ts`
Expected: FAIL — `importImageFiles` takes 4 arguments / `onProgress` never called

- [ ] **Step 3: Add the option to `importImages.ts`**

Add the type and thread it through both loops. In `src/views/area-gallery/importImages.ts`:

```ts
export interface ImportImagesOptions {
	onProgress?: (done: number, total: number) => void;
}
```

Change both signatures:

```ts
export async function importImageFiles(
	app: App,
	attachmentsDir: string,
	files: File[],
	existingItems: AreaItem[],
	options?: ImportImagesOptions,
): Promise<ImportImageResult> {
```

```ts
export async function importVaultImageFiles(
	app: App,
	attachmentsDir: string,
	files: TFile[],
	existingItems: AreaItem[],
	options?: ImportImagesOptions,
): Promise<ImportImageResult> {
```

In each function, wrap the existing loop body in `try`/`finally` so every
`continue` still ticks (a `continue` runs the `finally` block):

```ts
	for (const [index, file] of files.entries()) {
		try {
			// …existing per-file body, unchanged, `const name = …` included…
		} finally {
			options?.onProgress?.(index + 1, files.length);
		}
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test`
Expected: PASS (whole suite)

- [ ] **Step 5: Create the progress notice**

```ts
// src/views/area-gallery/importProgress.ts
import { Notice } from "obsidian";

const IMMEDIATE_THRESHOLD = 3; // files — larger batches show progress at once
const DELAY_MS = 800; // small batches only surface if they turn out slow

/**
 * Progress notice for one import batch. dispose() must run in a finally:
 * without it, an import finishing just before the delay timer fires would
 * leak a zero-duration Notice nobody can dismiss.
 */
export function createImportProgress(total: number): {
	onProgress: (done: number, total: number) => void;
	dispose: () => void;
} {
	let notice: Notice | null = null;
	let timer: number | null = null;
	let message = formatProgress(0, total);

	const show = () => {
		notice ??= new Notice(message, 0);
	};

	if (total > IMMEDIATE_THRESHOLD) show();
	else timer = window.setTimeout(show, DELAY_MS);

	return {
		onProgress: (done, currentTotal) => {
			message = formatProgress(done, currentTotal);
			notice?.setMessage(message);
		},
		dispose: () => {
			if (timer !== null) window.clearTimeout(timer);
			timer = null;
			notice?.hide();
			notice = null;
		},
	};
}

function formatProgress(done: number, total: number): string {
	return `Area: importing ${done}/${total}…`;
}
```

- [ ] **Step 6: Wire it into the controller**

In `src/views/area-gallery/importController.ts`, both import methods take the
same shape — shown here for `importFiles`, mirror it in `importVaultFiles`:

```ts
	async importFiles(files: File[]): Promise<void> {
		if (this.importsBlocked()) return;
		const areaPath = this.view.file?.path;
		if (!areaPath) return;

		const progress = createImportProgress(files.length);
		try {
			const result = await importImageFiles(
				this.plugin.app,
				this.plugin.settings.attachmentsDir,
				files,
				this.view.getItems(),
				{ onProgress: progress.onProgress },
			);
			showImportImageResultNotice(
				await commitImportedItems(this.plugin.app, areaPath, result),
			);
		} finally {
			progress.dispose();
		}
	}
```

Add the import:

```ts
import { createImportProgress } from "./importProgress";
```

- [ ] **Step 7: Verify**

Run: `bun test && bun run type-check && bun run build`
Expected: all green

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(gallery): progress notice for batch imports"
```

---

### Task 4: "Add to area…" command and menus

**Files:**
- Create: `src/commands/addToArea.ts`
- Create: `src/commands/areaOrdering.ts`
- Modify: `src/commands/index.ts`, `src/settings.ts`, `manifest.json`
- Test: `tests/areaOrdering.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/areaOrdering.test.ts
import { describe, expect, test } from "bun:test";
import { orderAreasByRecency } from "../src/commands/areaOrdering";

const area = (path: string, basename: string) => ({ path, basename });

describe("orderAreasByRecency", () => {
	test("recently opened areas come first, in recency order", () => {
		const ordered = orderAreasByRecency(
			[area("z.area", "z"), area("a.area", "a"), area("m.area", "m")],
			["m.area", "z.area"],
		);
		expect(ordered.map((f) => f.path)).toEqual(["m.area", "z.area", "a.area"]);
	});

	test("areas never opened sort alphabetically by basename", () => {
		const ordered = orderAreasByRecency(
			[area("2.area", "beta"), area("1.area", "alpha")],
			[],
		);
		expect(ordered.map((f) => f.basename)).toEqual(["alpha", "beta"]);
	});

	test("recency paths that are not areas are ignored", () => {
		const ordered = orderAreasByRecency(
			[area("a.area", "a")],
			["note.md", "a.area"],
		);
		expect(ordered.map((f) => f.path)).toEqual(["a.area"]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/areaOrdering.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the ordering module**

```ts
// src/commands/areaOrdering.ts

// Generic over the shape rather than TFile so bun can test it without the
// Obsidian runtime.
export function orderAreasByRecency<T extends { path: string; basename: string }>(
	areas: T[],
	lastOpenPaths: string[],
): T[] {
	const rank = new Map(lastOpenPaths.map((path, index) => [path, index]));
	return [...areas].sort((a, b) => {
		const rankA = rank.get(a.path) ?? Number.POSITIVE_INFINITY;
		const rankB = rank.get(b.path) ?? Number.POSITIVE_INFINITY;
		if (rankA !== rankB) return rankA - rankB;
		return a.basename.localeCompare(b.basename);
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/areaOrdering.test.ts`
Expected: PASS

- [ ] **Step 5: Add the setting**

In `src/settings.ts`:

```ts
export interface AreaPluginSettings {
	cardSize: "s" | "m" | "l";
	showCardTitles: boolean;
	attachmentsDir: string;
	hideDetailHeader: boolean;
	addToAreaTarget: "ask" | "active-area";
}

export const DEFAULT_SETTINGS: AreaPluginSettings = {
	cardSize: "m",
	showCardTitles: true,
	attachmentsDir: ATTACHMENTS_DIR,
	hideDetailHeader: true,
	addToAreaTarget: "ask",
};
```

And in `AreaSettingTab.display()`, after the "Hide detail header" setting:

```ts
		new Setting(containerEl)
			.setName("“Add to area” destination")
			.setDesc(
				"Always ask which area to add to, or add straight into the open " +
					"area when exactly one is open.",
			)
			.addDropdown((drop) =>
				drop
					.addOption("ask", "Always ask")
					.addOption("active-area", "Use the open area")
					.setValue(this.areaPlugin.settings.addToAreaTarget)
					.onChange(async (value) => {
						this.areaPlugin.settings.addToAreaTarget =
							value as "ask" | "active-area";
						await this.areaPlugin.saveSettings();
					}),
			);
```

- [ ] **Step 6: Write the command module**

```ts
// src/commands/addToArea.ts
import {
	Notice,
	TFile,
	type App,
	type Menu,
	type TAbstractFile,
} from "obsidian";
import { FILE_EXT, VIEW_TYPE_AREA } from "../constants";
import type AreaPlugin from "../main";
import { parseAreaFile } from "../areaFile";
import type { AreaItem } from "../types";
import { commitImportedItems } from "../views/area-gallery/commitImports";
import { isSupportedVaultImageFile } from "../views/area-gallery/imageFileTypes";
import { importVaultImageFiles } from "../views/area-gallery/importImages";
import { showImportImageResultNotice } from "../views/area-gallery/importNotices";
import { createImportProgress } from "../views/area-gallery/importProgress";
import { findAreaGallery } from "../views/item-detail/galleryBridge";
import { FileSuggestModal } from "../views/fileSuggest";
import { orderAreasByRecency } from "./areaOrdering";

// "Add current image to area…" from the palette, plus "Add to area…" on the
// file and multi-file context menus. All three funnel into the same pick →
// import → commit flow; the commit path (commitImports.ts) owns the open-view
// vs closed-file decision.
export function registerAddToArea(plugin: AreaPlugin): void {
	plugin.addCommand({
		id: "area:add-file-to-area",
		name: "Add current image to area…",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !isSupportedVaultImageFile(file)) return false;
			if (!checking) addFilesToArea(plugin, [file]);
			return true;
		},
	});

	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file) => {
			addMenuEntry(plugin, menu, [file]);
		}),
	);

	plugin.registerEvent(
		plugin.app.workspace.on("files-menu", (menu, files) => {
			addMenuEntry(plugin, menu, files);
		}),
	);
}

function addMenuEntry(
	plugin: AreaPlugin,
	menu: Menu,
	files: TAbstractFile[],
): void {
	// The events also fire for folders and non-image files.
	const images = files.filter(
		(f): f is TFile => f instanceof TFile && isSupportedVaultImageFile(f),
	);
	if (images.length === 0) return;

	menu.addItem((item) =>
		item
			.setTitle(images.length === 1 ? "Add to area…" : `Add ${images.length} images to area…`)
			.setIcon("layout-grid")
			.onClick(() => addFilesToArea(plugin, images)),
	);
}

function addFilesToArea(plugin: AreaPlugin, images: TFile[]): void {
	pickTargetArea(plugin, (target) => {
		void importInto(plugin, target.path, images);
	});
}

function pickTargetArea(
	plugin: AreaPlugin,
	onPick: (file: TFile) => void,
): void {
	const areas = plugin.app.vault
		.getFiles()
		.filter((f) => f.extension === FILE_EXT);
	if (areas.length === 0) {
		new Notice("No areas found. Use 'New area' to create one.");
		return;
	}

	if (plugin.settings.addToAreaTarget === "active-area") {
		const target = soleOpenAreaFile(plugin.app);
		if (target) {
			onPick(target);
			return;
		}
		// Zero or several open areas: guessing is how images land in the wrong
		// board — fall through to the modal.
	}

	const ordered = orderAreasByRecency(
		areas,
		plugin.app.workspace.getLastOpenFiles(),
	);
	new FileSuggestModal(plugin.app, ordered, onPick, "Add to area…").open();
}

function soleOpenAreaFile(app: App): TFile | null {
	const leaves = app.workspace.getLeavesOfType(VIEW_TYPE_AREA);
	if (leaves.length !== 1) return null;
	const path = (leaves[0].view as { file?: TFile | null }).file?.path;
	const file = path ? app.vault.getAbstractFileByPath(path) : null;
	return file instanceof TFile ? file : null;
}

async function importInto(
	plugin: AreaPlugin,
	areaPath: string,
	images: TFile[],
): Promise<void> {
	const progress = createImportProgress(images.length);
	try {
		const result = await importVaultImageFiles(
			plugin.app,
			plugin.settings.attachmentsDir,
			images,
			await peekExistingItems(plugin.app, areaPath),
			{ onProgress: progress.onProgress },
		);
		showImportImageResultNotice(
			await commitImportedItems(plugin.app, areaPath, result),
		);
	} finally {
		progress.dispose();
	}
}

// Best-effort pre-import dedup so already-present images skip thumbnail work.
// Only a peek: the commit re-partitions against the state it actually writes.
async function peekExistingItems(
	app: App,
	areaPath: string,
): Promise<AreaItem[]> {
	const gallery = findAreaGallery(app, areaPath);
	if (gallery) return gallery.getAreaData().items;

	const file = app.vault.getAbstractFileByPath(areaPath);
	if (!(file instanceof TFile)) return [];
	try {
		return parseAreaFile(await app.vault.read(file)).items;
	} catch {
		return [];
	}
}
```

- [ ] **Step 7: Register it**

In `src/commands/index.ts`, add the import and one call at the end of
`registerCommands`:

```ts
import { registerAddToArea } from "./addToArea";
```

```ts
	registerAddToArea(plugin);
```

- [ ] **Step 8: Bump `minAppVersion`**

In `manifest.json`: `"minAppVersion": "1.4.10"` (needed by `files-menu`;
`Vault.process` needs 1.1.0). `versions.json` is updated at the next release,
per the release checklist — not now.

- [ ] **Step 9: Verify**

Run: `bun test && bun run type-check && bun run build && bun run lint`
Expected: all green

Manual (Obsidian, `bun run dev`): palette command appears only with an image
file active; right-click one image → "Add to area…"; multi-select two images →
"Add 2 images to area…"; modal lists last-opened area first; setting switched
to "Use the open area" with one area open skips the modal; import into a
closed area then open it — items are there.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(commands): add vault images to any area from the palette and file menus

New addToAreaTarget setting (ask / use the open area), recency-ordered
area picker, files-menu multi-select. minAppVersion 1.4.10 for
files-menu and Vault.process."
```

---

### Task 5: Per-file failure notices

**Files:**
- Modify: `src/views/area-gallery/importNotices.ts`
- Test: `tests/importNotices.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/importNotices.test.ts
import { describe, expect, test } from "bun:test";
import { getImportNoticeLines } from "../src/views/area-gallery/importNotices";
import type { ImportImageResult } from "../src/views/area-gallery/importImages";

function result(partial: Partial<ImportImageResult>): ImportImageResult {
	return {
		items: [],
		skippedDuplicates: [],
		unsupported: [],
		failed: [],
		...partial,
	};
}

describe("getImportNoticeLines", () => {
	test("counts-only when nothing failed", () => {
		const lines = getImportNoticeLines(
			result({ skippedDuplicates: [{ name: "a" }] }),
		);
		expect(lines).toEqual(["Area: 1 skipped duplicate."]);
	});

	test("appends one line per failure with its reason", () => {
		const lines = getImportNoticeLines(
			result({ failed: [{ name: "a.png", message: "too large" }] }),
		);
		expect(lines).toEqual([
			"Area: 1 failed to import file.",
			"a.png — too large",
		]);
	});

	test("caps detail at 3 lines and counts the rest", () => {
		const failed = ["a", "b", "c", "d", "e"].map((name) => ({
			name: `${name}.png`,
			message: "boom",
		}));
		const lines = getImportNoticeLines(result({ failed }));
		expect(lines.length).toBe(5); // summary + 3 details + "+2 more"
		expect(lines.at(-1)).toBe("+2 more");
	});

	test("falls back when the message is missing and strips absolute paths", () => {
		const lines = getImportNoticeLines(
			result({
				failed: [
					{ name: "a.png" },
					{ name: "b.png", message: "ENOENT: open '/Users/me/secret/x.png'" },
				],
			}),
		);
		expect(lines[1]).toBe("a.png — could not be imported");
		expect(lines[2]).not.toContain("/Users");
	});

	test("truncates long file names", () => {
		const name = `${"x".repeat(60)}.png`;
		const lines = getImportNoticeLines(
			result({ failed: [{ name, message: "boom" }] }),
		);
		expect(lines[1].length).toBeLessThan(60);
		expect(lines[1]).toContain("…");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/importNotices.test.ts`
Expected: FAIL — `getImportNoticeLines` is not exported

- [ ] **Step 3: Implement**

Replace `src/views/area-gallery/importNotices.ts` with:

```ts
import { Notice } from "obsidian";
import type { ImportImageResult } from "./importImages";

const MAX_FAILURE_LINES = 3;
const MAX_NAME_LENGTH = 40;

export function showImportImageResultNotice(result: ImportImageResult): void {
	const lines = getImportNoticeLines(result);
	if (lines.length === 1) {
		new Notice(lines[0]);
		return;
	}
	// Notice renders "\n" as a space; only a fragment yields real lines.
	const fragment = document.createDocumentFragment();
	lines.forEach((line, index) => {
		if (index > 0) fragment.appendChild(document.createElement("br"));
		fragment.appendChild(document.createTextNode(line));
	});
	new Notice(fragment);
}

// Pure line builder, split from the DOM assembly so bun can test the rules.
export function getImportNoticeLines(result: ImportImageResult): string[] {
	const lines = [getSummaryLine(result)];

	const shown = result.failed.slice(0, MAX_FAILURE_LINES);
	for (const failure of shown) {
		lines.push(
			`${truncateName(failure.name)} — ${sanitizeReason(failure.message)}`,
		);
	}
	const hidden = result.failed.length - shown.length;
	if (hidden > 0) lines.push(`+${hidden} more`);

	return lines;
}

function getSummaryLine(result: ImportImageResult): string {
	const parts: string[] = [];

	if (result.items.length > 0) {
		parts.push(formatCount(result.items.length, "added image", "added images"));
	}
	if (result.skippedDuplicates.length > 0) {
		parts.push(
			formatCount(
				result.skippedDuplicates.length,
				"skipped duplicate",
				"skipped duplicates",
			),
		);
	}
	if (result.unsupported.length > 0) {
		parts.push(
			formatCount(
				result.unsupported.length,
				"ignored unsupported file",
				"ignored unsupported files",
			),
		);
	}
	if (result.failed.length > 0) {
		parts.push(
			formatCount(
				result.failed.length,
				"failed to import file",
				"failed to import files",
			),
		);
	}

	if (parts.length === 0) return "Area: no images added.";
	return `Area: ${parts.join(", ")}.`;
}

// Raw fs errors embed the vault's absolute path — noisy, and a notice is no
// place to leak it.
function sanitizeReason(message: string | undefined): string {
	if (!message) return "could not be imported";
	const cleaned = message
		.replace(/(['"]?)\/[^\s'"]+\1/g, "…")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned || "could not be imported";
}

function truncateName(name: string): string {
	if (name.length <= MAX_NAME_LENGTH) return name;
	return `${name.slice(0, 24)}…${name.slice(-12)}`;
}

function formatCount(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test && bun run type-check`
Expected: all green

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(gallery): show per-file reasons when imports fail"
```

---

### Task 6: Paste `sourceUrl` capture

**Files:**
- Create: `src/views/area-gallery/pasteSource.ts`
- Modify: `src/views/area-gallery/importImages.ts` (`sourceUrl` option)
- Modify: `src/views/area-gallery/importController.ts` (paste handler)
- Test: `tests/pasteSource.test.ts`, `tests/importImages.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/pasteSource.test.ts
import { describe, expect, test } from "bun:test";
import { resolvePasteSourceUrl } from "../src/views/area-gallery/pasteSource";

describe("resolvePasteSourceUrl", () => {
	test("accepts a single http(s) src paired with a single file", () => {
		expect(resolvePasteSourceUrl(["https://cdn.example/a.png"], 1)).toBe(
			"https://cdn.example/a.png",
		);
		expect(resolvePasteSourceUrl(["http://example.com/a.png"], 1)).toBe(
			"http://example.com/a.png",
		);
	});

	test("rejects when the fragment has several imgs or the batch several files", () => {
		expect(
			resolvePasteSourceUrl(["https://a/x.png", "https://a/y.png"], 1),
		).toBeUndefined();
		expect(resolvePasteSourceUrl(["https://a/x.png"], 2)).toBeUndefined();
		expect(resolvePasteSourceUrl([], 1)).toBeUndefined();
	});

	test("rejects non-http schemes", () => {
		expect(resolvePasteSourceUrl(["data:image/gif;base64,R0lGOD"], 1)).toBeUndefined();
		expect(resolvePasteSourceUrl(["file:///Users/me/a.png"], 1)).toBeUndefined();
		expect(resolvePasteSourceUrl(["javascript:alert(1)"], 1)).toBeUndefined();
		expect(resolvePasteSourceUrl(["/relative/a.png"], 1)).toBeUndefined();
	});
});
```

Append to `tests/importImages.test.ts` (inside the `importImageFiles options`
describe, reusing `makeImportApp`):

```ts
	test("sourceUrl lands on the created item", async () => {
		const result = await importImageFiles(
			makeImportApp(),
			"attachments",
			[new File([new Uint8Array(4)], "a.png", { type: "image/png" })],
			[],
			{ sourceUrl: "https://origin.example/a.png" },
		);
		expect(result.items[0]?.sourceUrl).toBe("https://origin.example/a.png");
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/pasteSource.test.ts tests/importImages.test.ts`
Expected: FAIL — module not found / `sourceUrl` undefined

- [ ] **Step 3: Write `pasteSource.ts`**

```ts
// src/views/area-gallery/pasteSource.ts

// No Obsidian imports: the acceptance rule must stay bun-testable. DOMParser
// is only touched at call time, inside Obsidian's renderer.

/** All <img> src values in a clipboard HTML fragment. DOM-parsed — an HTML
 * fragment is not a regex problem. */
export function extractImgSrcs(html: string): string[] {
	const doc = new DOMParser().parseFromString(html, "text/html");
	return Array.from(doc.querySelectorAll("img"))
		.map((img) => img.getAttribute("src") ?? "")
		.filter((src) => src.length > 0);
}

/**
 * The origin URL to preserve for a paste, or undefined. Requires exactly one
 * <img> in the fragment AND one file in the batch — any other pairing risks
 * attaching the wrong origin (an inline avatar next to the real image, say).
 * http(s) only: data: URIs can weigh megabytes, file:/javascript: are junk.
 * This is the asset URL, not the page URL — the honest best available
 * without network calls.
 */
export function resolvePasteSourceUrl(
	srcs: string[],
	fileCount: number,
): string | undefined {
	if (fileCount !== 1 || srcs.length !== 1) return undefined;
	try {
		const url = new URL(srcs[0]);
		if (url.protocol === "http:" || url.protocol === "https:") return srcs[0];
	} catch {
		// Relative or malformed — no usable origin.
	}
	return undefined;
}
```

- [ ] **Step 4: Thread `sourceUrl` through `importImages.ts`**

```ts
export interface ImportImagesOptions {
	onProgress?: (done: number, total: number) => void;
	// Applied to every created item; callers pass it only for single-file
	// batches where the pairing is unambiguous.
	sourceUrl?: string;
}
```

In `importImageFiles`, pass it to the item factory:

```ts
				const item = await createExternalImageItem(
					app,
					file,
					vaultPath,
					options?.sourceUrl,
				);
```

And in `createExternalImageItem`:

```ts
async function createExternalImageItem(
	app: App,
	file: File,
	vaultPath: string,
	sourceUrl?: string,
): Promise<AreaItem> {
	const buffer = await file.arrayBuffer();
	await app.vault.createBinary(vaultPath, buffer);

	return {
		id: crypto.randomUUID(),
		type: "image",
		vaultPath,
		tags: [],
		addedAt: Date.now(),
		title: getTitleFromFileName(file.name, "Imported image"),
		...(sourceUrl ? { sourceUrl } : {}),
		...(await readAspectRatio(file)),
	};
}
```

- [ ] **Step 5: Read the clipboard synchronously in the paste handler**

In `src/views/area-gallery/importController.ts`, `registerPaste` becomes:

```ts
	private registerPaste(): void {
		this.view.registerDomEvent(document, "paste", async (e: ClipboardEvent) => {
			if (!this.shouldHandlePaste(e)) return;

			const files = getClipboardImageFiles(e);
			if (files.length === 0) {
				new Notice("Area: clipboard has no images.");
				return;
			}

			// The DataTransfer dies when the handler returns: everything it
			// holds must be read before the first await.
			const html = e.clipboardData?.getData("text/html") ?? "";
			e.preventDefault();

			const sourceUrl = html
				? resolvePasteSourceUrl(extractImgSrcs(html), files.length)
				: undefined;
			await this.importFiles(files, { sourceUrl });
		});
	}
```

`importFiles` gains the passthrough parameter:

```ts
	async importFiles(
		files: File[],
		options?: { sourceUrl?: string },
	): Promise<void> {
		if (this.importsBlocked()) return;
		const areaPath = this.view.file?.path;
		if (!areaPath) return;

		const progress = createImportProgress(files.length);
		try {
			const result = await importImageFiles(
				this.plugin.app,
				this.plugin.settings.attachmentsDir,
				files,
				this.view.getItems(),
				{ onProgress: progress.onProgress, sourceUrl: options?.sourceUrl },
			);
			showImportImageResultNotice(
				await commitImportedItems(this.plugin.app, areaPath, result),
			);
		} finally {
			progress.dispose();
		}
	}
```

Add the import:

```ts
import { extractImgSrcs, resolvePasteSourceUrl } from "./pasteSource";
```

- [ ] **Step 6: Verify**

Run: `bun test && bun run type-check && bun run build`
Expected: all green

Manual (Obsidian): copy an image in a browser ("Copy image"), paste into an
area → detail view shows the source URL; paste a screenshot → no source URL,
no error.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(gallery): preserve the origin URL when pasting a browser image"
```

---

### Task 7: Aspect ratio for vault imports

**Files:**
- Modify: `src/views/area-gallery/importImages.ts`

- [ ] **Step 1: Implement**

In `importVaultImageFiles`, after the item literal is built and before
`createThumbnail` (`readAspectRatio` already accepts any `Blob` and fails
soft — under bun it no-ops through its catch):

```ts
			try {
				const bytes = await app.vault.adapter.readBinary(file.path);
				Object.assign(item, await readAspectRatio(new Blob([bytes])));
			} catch {
				// Unreadable here means the thumbnail path will surface it; the
				// card falls back to measuring on load either way.
			}
```

- [ ] **Step 2: Verify**

Run: `bun test && bun run type-check && bun run build`
Expected: all green

Manual: add a vault image via the command into an open area — the card gets
its height before the image paints (no masonry reflow jump).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(gallery): record aspect ratio for vault-imported items"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/09-product-roadmap.md`, `CLAUDE.md`

- [ ] **Step 1: Update the roadmap**

In `docs/09-product-roadmap.md`, Priority 1 list — mark shipped and record
the deferrals:

```markdown
- Paste an image from the clipboard directly into the active area. — **Shipped.**
- Improve drag and drop with visible drop state, progress, and readable errors. — **Shipped.**
- Import images that already exist in the vault. — **Shipped.**
- Suggest the original filename as the item title. — **Shipped.**
- Detect duplicates by existing vault path, and later by a lightweight hash if
  needed. — **Path-based shipped.** Hash dedup deferred; note that externally
  dropped files always get a fresh path, so only a hash can dedup them.
- Add a command to add the current file or image to the active area. —
  **Shipped** (spec: `superpowers/specs/2026-09-09-capture-gaps-design.md`).
  Images stored under dot-folders have no `TFile` and stay out of reach;
  cross-area copy is a separate feature.
- Preserve useful source metadata when available, without guessing or calling
  external services. — **Shipped for paste** (asset URL, single-image pastes
  only). Drop capture is impossible without network calls: browser drags carry
  no file, Finder drags carry `file://` URLs.
```

And in "Recommended build order", mark step 1:

```markdown
1. Capture improvements and duplicate handling. — **Done** (hash dedup deferred).
```

- [ ] **Step 2: Add the CLAUDE.md gotcha**

In `CLAUDE.md`, append to the Gotchas section:

```markdown
**Import commits go through `commitImportedItems`** (`src/views/area-gallery/commitImports.ts`) —
the single write path for adding items to an area. It resolves open-view vs
closed-file at commit time: direct `save()` through the view, atomic
`Vault.process` otherwise. Never `requestSave` an import commit, and never
add a second `.area` insertion path; the pure dedup rule lives in
`insertItems.ts`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/09-product-roadmap.md CLAUDE.md
git commit -m "docs: mark Priority 1 capture items shipped, record deferrals"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full suite**

Run: `bun test && bun run type-check && bun run lint && bun run build`
Expected: all green. Paste the output as evidence.

- [ ] **Step 2: Manual pass in Obsidian** (`bun run dev`, hot reload)

- Palette command visible only with an image active; adds to a chosen area.
- Right-click image → "Add to area…"; multi-select → "Add N images to area…".
- Modal lists last-opened area first.
- `addToAreaTarget = active-area` with one open area: no modal.
- Import into a **closed** area, then open it: items present, no corruption.
- Two rapid add-to-area invocations on the same closed area: both items land.
- Drop 10+ images: progress notice appears, updates, disappears.
- Paste a copied browser image: `sourceUrl` set. Paste a screenshot: unset.
- Import a duplicate vault image: skipped, no stray thumbnail left in `.thumbs/`
  (check via `obsidian eval` or the system file manager).
- Target an intentionally broken `.area`: readable error, file untouched.
- Mobile if available: long-press menu shows the entry.

- [ ] **Step 3: Review the diff**

Run: `git diff main --stat` and re-read every hunk. Delete anything
unnecessary. The diff exceeds 3 files / 100 lines → run `/code-review`
before claiming done.

---

## Self-review notes

- Spec coverage: Feature 1 → Tasks 2+4, Feature 2 → Task 3, Feature 3 →
  Task 5, Feature 4 → Task 6, plumbing → Tasks 4 (manifest) + 8 (docs),
  aspect-ratio micro-fix → Task 7. Deferred items are documentation-only by
  design.
- Type consistency: `ImportImagesOptions` is introduced in Task 3 and
  extended in Task 6; `partitionImportedItems` returns `{toAdd, skipped}`
  everywhere; `GallerySource` widening precedes its first use in Task 2.
- Ordering: every module exists before its first importer (partition → commit
  → progress → command).
