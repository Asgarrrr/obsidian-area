import { describe, expect, test } from "bun:test";
import { parseAreaFile } from "../src/areaFile";

describe("parseAreaFile", () => {
	test("parses a valid board and preserves all fields", () => {
		const raw = JSON.stringify({
			version: "1",
			name: "Refs",
			items: [
				{ id: "a", type: "image", vaultPath: "x.png", tags: [], addedAt: 1 },
			],
			schema: [{ id: "f1", label: "L", type: "text" }],
		});
		const file = parseAreaFile(raw);
		expect(file.name).toBe("Refs");
		expect(file.items).toHaveLength(1);
		expect(file.items[0]?.vaultPath).toBe("x.png");
		expect(file.schema?.[0]?.id).toBe("f1");
	});

	test("keeps unknown top-level keys (forward-compat, no data drop)", () => {
		const file = parseAreaFile('{"items":[],"future":42}') as Record<
			string,
			unknown
		>;
		expect(file.future).toBe(42);
	});

	test("throws on malformed JSON", () => {
		expect(() => parseAreaFile("{not json")).toThrow();
	});

	// Each of these is valid JSON but not an Area board — must throw so the view
	// routes to its unreadable/round-trip path instead of crashing on .items.
	test.each([
		["empty object", "{}"],
		["bare array", "[]"],
		["items not an array", '{"items":"nope"}'],
		["null", "null"],
		["a number", "3"],
	])("throws when %s", (_label, raw) => {
		expect(() => parseAreaFile(raw)).toThrow();
	});
});
