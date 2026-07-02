import { Notice } from "obsidian";
import type { AreaItem } from "../../types";

export function getSourceUrl(item: AreaItem): string | null {
	const sourceUrl = item.sourceUrl?.trim();
	return sourceUrl ? sourceUrl : null;
}

export function getValidSourceUrl(item: AreaItem): string | null {
	const sourceUrl = getSourceUrl(item);
	if (!sourceUrl) return null;

	try {
		const url = new URL(sourceUrl);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

export function openSourceUrl(item: AreaItem): void {
	if (!getSourceUrl(item)) {
		new Notice("Add a source URL first");
		return;
	}

	const url = getValidSourceUrl(item);
	if (!url) {
		new Notice("Source URL must start with http:// or https://");
		return;
	}

	window.open(url, "_blank", "noopener");
}

export async function copySourceUrl(item: AreaItem): Promise<void> {
	const sourceUrl = getSourceUrl(item);
	if (!sourceUrl) {
		new Notice("Add a source URL first");
		return;
	}

	try {
		await writeClipboard(sourceUrl);
		new Notice("Source URL copied");
	} catch {
		new Notice("Could not copy source URL");
	}
}

export async function writeClipboard(value: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(value);
		return;
	}

	const textarea = document.body.createEl("textarea");
	textarea.value = value;
	textarea.addClass("area-clipboard-fallback");
	textarea.select();

	try {
		if (!document.execCommand("copy")) {
			throw new Error("Copy command failed");
		}
	} finally {
		textarea.remove();
	}
}
