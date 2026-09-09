// No Obsidian imports: the acceptance rule must stay bun-testable. DOMParser
// is only touched at call time, inside Obsidian's renderer.

/** All <img> src values in a clipboard HTML fragment. DOM-parsed — an HTML
 * fragment is not a regex problem. */
export function extractImgSrcs(html: string): string[] {
	const doc = new DOMParser().parseFromString(html, "text/html");
	return Array.from(doc.querySelectorAll("img"))
		.map((img) => img.getAttribute("src") ?? "")
		.filter((src) => src.length > 0);
}

/**
 * The origin URL to preserve for a paste, or undefined. Requires exactly one
 * <img> in the fragment AND one file in the batch — any other pairing risks
 * attaching the wrong origin (an inline avatar next to the real image, say).
 * http(s) only: data: URIs can weigh megabytes, file:/javascript: are junk.
 * This is the asset URL, not the page URL — the honest best available
 * without network calls.
 */
export function resolvePasteSourceUrl(
	srcs: string[],
	fileCount: number,
): string | undefined {
	if (fileCount !== 1 || srcs.length !== 1) return undefined;
	const src = srcs[0];
	if (src === undefined) return undefined;
	try {
		const url = new URL(src);
		if (url.protocol === "http:" || url.protocol === "https:") return src;
	} catch {
		// Relative or malformed — no usable origin.
	}
	return undefined;
}
