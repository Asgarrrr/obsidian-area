import { describe, expect, test } from "bun:test";
import {
	getImageExtensionFromMimeType,
	isSupportedImageFile,
} from "../src/views/area-gallery/imageFileTypes";

describe("getImageExtensionFromMimeType", () => {
	test.each([
		["image/png", "png"],
		["image/jpeg", "jpg"],
		["image/jpg", "jpg"],
		["image/svg+xml", "svg"],
		["image/webp", "webp"],
		["image/gif", "gif"],
		["image/avif", "avif"],
	])("%s → %s", (mime, ext) => {
		expect(getImageExtensionFromMimeType(mime)).toBe(ext);
	});

	test("unknown mime defaults to png", () => {
		expect(getImageExtensionFromMimeType("application/octet-stream")).toBe(
			"png",
		);
	});
});

describe("isSupportedImageFile", () => {
	test("accepts by MIME type", () => {
		expect(isSupportedImageFile(new File([], "x", { type: "image/png" }))).toBe(
			true,
		);
	});

	test("accepts by extension (case-insensitive) when MIME is absent", () => {
		expect(isSupportedImageFile(new File([], "photo.WEBP"))).toBe(true);
	});

	test("rejects unsupported files", () => {
		expect(isSupportedImageFile(new File([], "notes.txt"))).toBe(false);
	});
});
