import { Notice, type App } from "obsidian";
import { writeClipboard } from "./sourceActions";

const SAMPLE_MAX_DIM = 64; // downscale target — enough signal, negligible cost
const ALPHA_FLOOR = 125; // ignore near-transparent pixels
const DEFAULT_SWATCH_COUNT = 8;

// Session cache keyed by vault path: the palette of an image doesn't change, so
// paging ←/→ back to a seen item resolves instantly instead of re-decoding.
const paletteCache = new Map<string, string[]>();

/**
 * Extract the dominant colours of a vault image as hex strings, most frequent
 * first. Reads the raw bytes into a blob URL (rather than the `app://` resource
 * path) so the canvas is never cross-origin tainted on mobile. Returns `[]` on
 * any failure — the caller treats an empty palette as "just don't show it".
 */
export async function extractPalette(
	app: App,
	vaultPath: string,
	count = DEFAULT_SWATCH_COUNT,
): Promise<string[]> {
	const cached = paletteCache.get(vaultPath);
	if (cached !== undefined) return cached;

	let url: string | null = null;
	try {
		const bytes = await app.vault.adapter.readBinary(vaultPath);
		url = URL.createObjectURL(new Blob([bytes]));
		const image = await loadImage(url);
		const pixels = drawAndSample(image);
		const colors = pixels ? quantize(pixels, count) : [];
		// Cache only successful extractions; a thrown error (file not ready, etc.)
		// falls through to `[]` uncached so a later revisit can retry.
		paletteCache.set(vaultPath, colors);
		return colors;
	} catch {
		return [];
	} finally {
		if (url) URL.revokeObjectURL(url);
	}
}

/** Render (or clear) a row of clickable swatches; click copies the hex. */
export function renderPalette(container: HTMLElement, colors: string[]): void {
	container.empty();
	if (colors.length === 0) {
		container.addClass("area-detail-palette--empty");
		return;
	}
	container.removeClass("area-detail-palette--empty");
	for (const color of colors) {
		const swatch = container.createEl("button", {
			cls: "area-detail-swatch",
		});
		swatch.type = "button";
		swatch.style.backgroundColor = color;
		swatch.setAttribute("title", color);
		swatch.setAttribute("aria-label", `Copy ${color}`);
		swatch.addEventListener("click", () => {
			void copyColor(color);
		});
	}
}

async function copyColor(color: string): Promise<void> {
	try {
		await writeClipboard(color);
		new Notice(`Copied ${color}`);
	} catch {
		new Notice("Couldn't copy colour");
	}
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Could not decode image"));
		image.src = url;
	});
}

function drawAndSample(image: HTMLImageElement): Uint8ClampedArray | null {
	const { naturalWidth: w, naturalHeight: h } = image;
	if (!w || !h) return null;

	const scale = Math.min(1, SAMPLE_MAX_DIM / Math.max(w, h));
	const cw = Math.max(1, Math.round(w * scale));
	const ch = Math.max(1, Math.round(h * scale));

	const canvas = document.createElement("canvas");
	canvas.width = cw;
	canvas.height = ch;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;

	ctx.drawImage(image, 0, 0, cw, ch);
	return ctx.getImageData(0, 0, cw, ch).data;
}

interface Bucket {
	count: number;
	r: number;
	g: number;
	b: number;
}

// Coarse 3D histogram: quantise each channel to 16 levels, accumulate the true
// colours per bucket, then average the most-populated buckets back to real hex.
function quantize(data: Uint8ClampedArray, count: number): string[] {
	const buckets = new Map<number, Bucket>();

	for (let i = 0; i + 3 < data.length; i += 4) {
		if ((data[i + 3] ?? 0) < ALPHA_FLOOR) continue;
		const r = data[i] ?? 0;
		const g = data[i + 1] ?? 0;
		const b = data[i + 2] ?? 0;
		const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
		const bucket = buckets.get(key);
		if (bucket) {
			bucket.count++;
			bucket.r += r;
			bucket.g += g;
			bucket.b += b;
		} else {
			buckets.set(key, { count: 1, r, g, b });
		}
	}

	return [...buckets.values()]
		.sort((a, b) => b.count - a.count)
		.slice(0, count)
		.map(({ count: c, r, g, b }) => toHex(r / c, g / c, b / c));
}

function toHex(r: number, g: number, b: number): string {
	const channel = (n: number) => Math.round(n).toString(16).padStart(2, "0");
	return `#${channel(r)}${channel(g)}${channel(b)}`;
}
