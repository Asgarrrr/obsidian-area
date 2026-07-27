import { normalizePath, type App } from "obsidian";
import type { AreaItem } from "../../types";
import { getFileExtension } from "./imageFileTypes";

// Cards are at most 300px wide, but they were painting full-resolution
// originals — a 4000px photo decoded into a 200px tile costs orders of
// magnitude more memory than the tile needs. Every import writes a downscaled
// WebP alongside the attachment and the grid renders that instead.

const THUMB_MAX_DIM = 640; // 2× the largest card, so retina still looks sharp
const THUMB_QUALITY = 0.82;
const THUMB_SUBDIR = ".thumbs";

// Animated or vector sources lose more than they gain: a GIF would be flattened
// to its first frame, an SVG is already tiny and scales for free.
const SKIPPED_EXTENSIONS = new Set(["gif", "svg"]);

export function getThumbnailDir(attachmentsDir: string): string {
	return normalizePath(`${attachmentsDir}/${THUMB_SUBDIR}`);
}

/**
 * Write a downscaled copy of an item's image and return its vault path, or
 * `undefined` when a thumbnail would be pointless (unsupported format, source
 * already small) or impossible (undecodable, write failure). Best-effort by
 * design: the caller falls back to rendering the original.
 */
export async function createThumbnail(
	app: App,
	item: AreaItem,
	attachmentsDir: string,
): Promise<string | undefined> {
	const ext = getFileExtension(item.vaultPath);
	if (ext && SKIPPED_EXTENSIONS.has(ext)) return undefined;

	try {
		const bytes = await app.vault.adapter.readBinary(item.vaultPath);
		const blob = await downscale(new Blob([bytes]));
		if (!blob) return undefined;

		const dir = getThumbnailDir(attachmentsDir);
		if (!(await app.vault.adapter.exists(dir))) {
			await app.vault.adapter.mkdir(dir);
		}

		// Keyed by item id, so a thumbnail is unique per card and trivially
		// re-derivable — two items pointing at the same vault image get their own.
		const thumbPath = normalizePath(`${dir}/${item.id}.webp`);
		await app.vault.adapter.writeBinary(thumbPath, await blob.arrayBuffer());
		return thumbPath;
	} catch {
		return undefined;
	}
}

/** Delete an item's thumbnail. Silent when there is nothing to remove. */
export async function removeThumbnail(app: App, item: AreaItem): Promise<void> {
	if (!item.thumbPath) return;
	try {
		if (await app.vault.adapter.exists(item.thumbPath)) {
			await app.vault.adapter.remove(item.thumbPath);
		}
	} catch {
		// An orphaned thumbnail is harmless — never block a delete on it.
	}
}

// Returns null when the source is already at or below the target size: writing
// a second copy of a small image only costs disk.
async function downscale(source: Blob): Promise<Blob | null> {
	const bitmap = await createImageBitmap(source);
	try {
		const { width, height } = bitmap;
		if (!width || !height) return null;

		const scale = THUMB_MAX_DIM / Math.max(width, height);
		if (scale >= 1) return null;

		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(width * scale));
		canvas.height = Math.max(1, Math.round(height * scale));

		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

		return await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, "image/webp", THUMB_QUALITY);
		});
	} finally {
		bitmap.close();
	}
}
