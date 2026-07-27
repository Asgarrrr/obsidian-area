import type { App } from "obsidian";

// Pixel dimensions and byte size for the sidebar's specimen row. The filename of
// an imported image is a UUID, so it was the least informative thing the panel
// could have put in its most prominent slot.

export interface ImageMeta {
	width: number;
	height: number;
	size: number;
}

// Keyed by vault path: neither number changes while the file sits still, so
// paging ←/→ back to a seen item resolves without a second decode.
const metaCache = new Map<string, ImageMeta>();

export async function readImageMeta(
	app: App,
	vaultPath: string,
): Promise<ImageMeta | null> {
	const cached = metaCache.get(vaultPath);
	if (cached) return cached;

	try {
		const stat = await app.vault.adapter.stat(vaultPath);
		// Same URL the stage renders, so the decode comes off the browser cache.
		const dimensions = await readDimensions(
			app.vault.adapter.getResourcePath(vaultPath),
		);
		if (!dimensions) return null;

		const meta = { ...dimensions, size: stat?.size ?? 0 };
		metaCache.set(vaultPath, meta);
		return meta;
	} catch {
		return null;
	}
}

export function formatDimensions({ width, height }: ImageMeta): string {
	return `${width} × ${height}`;
}

export function formatBytes(bytes: number): string {
	if (bytes <= 0) return "—";
	const units = ["B", "KB", "MB", "GB"];
	const exponent = Math.min(
		units.length - 1,
		Math.floor(Math.log(bytes) / Math.log(1024)),
	);
	const value = bytes / 1024 ** exponent;
	// Bytes and kilobytes read fine as integers; megabytes need a decimal to
	// distinguish 1.2 MB from 1.8 MB.
	const digits = exponent >= 2 && value < 100 ? 1 : 0;
	return `${value.toFixed(digits)} ${units[exponent]}`;
}

export function formatAddedAt(addedAt: number | undefined): string | null {
	if (!addedAt) return null;
	return new Date(addedAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function readDimensions(
	url: string,
): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		const image = new Image();
		image.onload = () =>
			resolve(
				image.naturalWidth && image.naturalHeight
					? { width: image.naturalWidth, height: image.naturalHeight }
					: null,
			);
		image.onerror = () => resolve(null);
		image.src = url;
	});
}
