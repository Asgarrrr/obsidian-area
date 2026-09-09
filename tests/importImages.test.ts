import { describe, expect, test } from "bun:test";
import type { App } from "obsidian";
import type { AreaItem } from "../src/types";
import {
	hasAreaItemWithVaultPath,
	importImageFiles,
} from "../src/views/area-gallery/importImages";

describe("hasAreaItemWithVaultPath", () => {
	const items = [{ vaultPath: "a/b.png" } as AreaItem];

	test("true when a matching vaultPath exists", () => {
		expect(hasAreaItemWithVaultPath(items, "a/b.png")).toBe(true);
	});

	test("false otherwise", () => {
		expect(hasAreaItemWithVaultPath(items, "a/c.png")).toBe(false);
	});
});

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
				new File([new Uint8Array(4)], "not-an-image.txt", {
					type: "text/plain",
				}),
			],
			[],
			{ onProgress: (done, total) => calls.push([done, total]) },
		);
		expect(calls).toEqual([
			[1, 2],
			[2, 2],
		]);
	});

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
});
