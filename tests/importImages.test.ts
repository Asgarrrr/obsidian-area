import { describe, expect, test } from "bun:test";
import type { AreaItem } from "../src/types";
import { hasAreaItemWithVaultPath } from "../src/views/area-gallery/importImages";

describe("hasAreaItemWithVaultPath", () => {
	const items = [{ vaultPath: "a/b.png" } as AreaItem];

	test("true when a matching vaultPath exists", () => {
		expect(hasAreaItemWithVaultPath(items, "a/b.png")).toBe(true);
	});

	test("false otherwise", () => {
		expect(hasAreaItemWithVaultPath(items, "a/c.png")).toBe(false);
	});
});
