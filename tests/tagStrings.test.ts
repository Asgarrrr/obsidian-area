import { describe, expect, test } from "bun:test";
import {
	canonicalTag,
	mergeTags,
	normalizeAreaTagInput,
	parseTagInput,
	sameTags,
} from "../src/tagStrings";

describe("normalizeAreaTagInput", () => {
	test("strips leading hashes, trailing commas, collapses spaces to dashes", () => {
		expect(normalizeAreaTagInput("  ##palette bordeaux,, ")).toBe(
			"palette-bordeaux",
		);
	});

	test("returns null for input that normalizes to nothing", () => {
		expect(normalizeAreaTagInput(" ## ")).toBeNull();
	});

	// Interior whitespace survives the hash/comma stripping and becomes a dash,
	// so this input is not "nothing". Unreachable from the tag editor, which
	// splits on commas before normalizing.
	test("interior whitespace before a trailing comma yields a dash", () => {
		expect(normalizeAreaTagInput(" ## ,")).toBe("-");
	});
});

describe("canonicalTag", () => {
	test("lowercases and strips hashes for identity comparison", () => {
		expect(canonicalTag("#Design")).toBe(canonicalTag("design"));
	});
});

describe("parseTagInput", () => {
	test("splits on commas and drops empty parts", () => {
		expect(parseTagInput("a, ,b,")).toEqual(["a", "b"]);
	});
});

describe("mergeTags", () => {
	test("appends only case-insensitively new tags", () => {
		expect(mergeTags(["Design"], ["design", "ui"])).toEqual(["Design", "ui"]);
	});
});

describe("sameTags", () => {
	test("compares order-sensitively", () => {
		expect(sameTags(["a", "b"], ["b", "a"])).toBe(false);
		expect(sameTags(["a"], ["a"])).toBe(true);
	});
});
