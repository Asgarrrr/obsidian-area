import { Notice } from "obsidian";
import type { ImportImageResult } from "./importImages";

export function showImportImageResultNotice(result: ImportImageResult): void {
	new Notice(getImportImageResultNoticeMessage(result));
}

function getImportImageResultNoticeMessage(result: ImportImageResult): string {
	const parts: string[] = [];

	if (result.items.length > 0) {
		parts.push(formatCount(result.items.length, "added image", "added images"));
	}
	if (result.skippedDuplicates.length > 0) {
		parts.push(
			formatCount(
				result.skippedDuplicates.length,
				"skipped duplicate",
				"skipped duplicates",
			),
		);
	}
	if (result.unsupported.length > 0) {
		parts.push(
			formatCount(
				result.unsupported.length,
				"ignored unsupported file",
				"ignored unsupported files",
			),
		);
	}
	if (result.failed.length > 0) {
		parts.push(
			formatCount(
				result.failed.length,
				"failed to import file",
				"failed to import files",
			),
		);
	}

	if (parts.length === 0) return "Area: no images added.";
	return `Area: ${parts.join(", ")}.`;
}

function formatCount(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}
