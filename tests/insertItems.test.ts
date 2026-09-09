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
