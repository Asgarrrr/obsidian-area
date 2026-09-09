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
