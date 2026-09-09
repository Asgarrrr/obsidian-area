import { describe, expect, test } from "bun:test";
import { TFile, type App } from "obsidian";
import { commitImportedItems } from "../src/views/area-gallery/commitImports";
import type { ImportImageResult } from "../src/views/area-gallery/importImages";
import type { AreaFile, AreaItem } from "../src/types";
import type { GallerySource } from "../src/views/item-detail/galleryBridge";

function item(vaultPath: string, thumbPath?: string): AreaItem {
	return {
		id: vaultPath,
		type: "image",
		vaultPath,
		tags: [],
		addedAt: 0,
		thumbPath,
	};
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
		const out = await commitImportedItems(
			app,
			"board.area",
			resultWith([item("new.png")]),
		);

		expect(out.items.map((i) => i.vaultPath)).toEqual(["new.png"]);
		expect(parsed().items.map((i) => i.vaultPath)).toEqual([
			"new.png",
			"old.png",
		]);
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
				process: async (_f: unknown, fn: (d: string) => string) =>
					fn("not json"),
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
		const out = await commitImportedItems(
			app,
			"gone.area",
			resultWith([item("new.png")]),
		);
		expect(out.items).toEqual([]);
		expect(out.failed.length).toBe(1);
	});
});

describe("commitImportedItems — open view", () => {
	test("unshifts into live items, saves directly, notifies", async () => {
		const areaFile: AreaFile = {
			version: "1",
			name: "b",
			items: [item("old.png")],
		};
		const { app, saves } = makeViewApp(areaFile);
		const out = await commitImportedItems(
			app,
			"board.area",
			resultWith([item("new.png")]),
		);

		expect(areaFile.items.map((i) => i.vaultPath)).toEqual([
			"new.png",
			"old.png",
		]);
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
		(app.workspace.getLeavesOfType("")[0].view as GallerySource).save =
			async () => {
				throw new Error("disk full");
			};
		const out = await commitImportedItems(
			app,
			"board.area",
			resultWith([item("new.png")]),
		);

		expect(out.items.length).toBe(1);
		expect(areaFile.items.length).toBe(1);
		expect(saves).toEqual(["requestSave", "notify"]);
	});
});
