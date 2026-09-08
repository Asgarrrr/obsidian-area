import { describe, expect, test } from "bun:test";
import { setCustomFieldValue } from "../src/fieldValues";
import type { AreaItem } from "../src/types";

function item(fields?: AreaItem["fields"]): AreaItem {
	return {
		id: "a",
		type: "image",
		vaultPath: "a.png",
		tags: [],
		addedAt: 0,
		fields,
	};
}

describe("setCustomFieldValue", () => {
	test("sets a value, creating the fields object", () => {
		const it = item();
		setCustomFieldValue(it, "x", "v");
		expect(it.fields).toEqual({ x: "v" });
	});

	test("undefined deletes the key and drops an emptied fields object", () => {
		const it = item({ x: "v" });
		setCustomFieldValue(it, "x", undefined);
		expect(it.fields).toBeUndefined();
	});

	test("empty string clears like undefined", () => {
		const it = item({ x: "v", y: "w" });
		setCustomFieldValue(it, "x", "");
		expect(it.fields).toEqual({ y: "w" });
	});

	test("clearing a missing key on a missing fields object is a no-op", () => {
		const it = item();
		setCustomFieldValue(it, "x", undefined);
		expect(it.fields).toBeUndefined();
	});
});
