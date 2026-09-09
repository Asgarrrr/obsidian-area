import { Notice } from "obsidian";
import type { ImportImageResult } from "./importResult";

const MAX_FAILURE_LINES = 3;
const MAX_NAME_LENGTH = 40;

export function showImportImageResultNotice(result: ImportImageResult): void {
	const lines = getImportNoticeLines(result);
	if (lines.length === 1) {
		new Notice(lines[0]);
		return;
	}
	// Notice renders "\n" as a space; only a fragment yields real lines.
	const fragment = document.createDocumentFragment();
	lines.forEach((line, index) => {
		if (index > 0) fragment.appendChild(document.createElement("br"));
		fragment.appendChild(document.createTextNode(line));
	});
	new Notice(fragment);
}

// Pure line builder, split from the DOM assembly so bun can test the rules.
export function getImportNoticeLines(
	result: ImportImageResult,
): [string, ...string[]] {
	// Non-empty by construction: the summary line is always present, which is
	// what lets `showImportImageResultNotice` read `lines[0]` under
	// `noUncheckedIndexedAccess`.
	const lines: [string, ...string[]] = [getSummaryLine(result)];

	const shown = result.failed.slice(0, MAX_FAILURE_LINES);
	for (const failure of shown) {
		lines.push(
			`${truncateName(failure.name)} — ${sanitizeReason(failure.message)}`,
		);
	}
	const hidden = result.failed.length - shown.length;
	if (hidden > 0) lines.push(`+${hidden} more`);

	return lines;
}

function getSummaryLine(result: ImportImageResult): string {
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

// Errno jargon means nothing to the user; anything unrecognized keeps its
// text, minus embedded paths.
const ERROR_CAUSES: Array<[RegExp, string]> = [
	[/ENOENT/, "file not found"],
	[/EACCES|EPERM/, "permission denied"],
	[/ENOSPC/, "disk full"],
];

// Raw fs errors embed the vault's absolute path — noisy, and a notice is no
// place to leak it.
function sanitizeReason(message: string | undefined): string {
	if (!message) return "could not be imported";
	for (const [pattern, cause] of ERROR_CAUSES) {
		if (pattern.test(message)) return cause;
	}
	const cleaned = message
		.replace(/(['"]?)\/[^\s'"]+\1/g, "…")
		.replace(/(['"]?)[A-Za-z]:\\[^\s'"]+\1/g, "…")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned || "could not be imported";
}

function truncateName(name: string): string {
	if (name.length <= MAX_NAME_LENGTH) return name;
	return `${name.slice(0, 24)}…${name.slice(-12)}`;
}

function formatCount(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}
