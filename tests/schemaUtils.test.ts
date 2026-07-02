import { describe, expect, test } from "bun:test";
import {
	createFieldId,
	hasOption,
	parseSelectOptions,
} from "../src/views/schema-editor/schemaUtils";

describe("createFieldId", () => {
	test("slugs a label to stable snake_case", () => {
		expect(createFieldId("Release Year")).toBe("release_year");
	});

	test("strips accents and punctuation", () => {
		expect(createFieldId("Prix (€) — café")).toBe("prix_cafe");
	});

	test("collapses and trims separators", () => {
		expect(createFieldId("  multiple   spaces  ")).toBe("multiple_spaces");
	});

	test("falls back to 'field' when nothing usable remains", () => {
		expect(createFieldId("€€€")).toBe("field");
		expect(createFieldId("")).toBe("field");
	});
});

describe("parseSelectOptions", () => {
	test("splits on commas, trims, and drops blanks", () => {
		expect(parseSelectOptions("a, b ,, c")).toEqual(["a", "b", "c"]);
	});

	test("de-duplicates case-insensitively (first spelling wins)", () => {
		expect(parseSelectOptions("Red, red, RED, blue")).toEqual(["Red", "blue"]);
	});
});

describe("hasOption", () => {
	test("matches case-insensitively", () => {
		expect(hasOption(["Red", "Blue"], "red")).toBe(true);
		expect(hasOption(["Red"], "green")).toBe(false);
	});
});
