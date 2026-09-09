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
		expect(
			resolvePasteSourceUrl(["data:image/gif;base64,R0lGOD"], 1),
		).toBeUndefined();
		expect(
			resolvePasteSourceUrl(["file:///Users/me/a.png"], 1),
		).toBeUndefined();
		expect(resolvePasteSourceUrl(["javascript:alert(1)"], 1)).toBeUndefined();
		expect(resolvePasteSourceUrl(["/relative/a.png"], 1)).toBeUndefined();
	});
});
