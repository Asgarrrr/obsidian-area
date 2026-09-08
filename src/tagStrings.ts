// Pure tag-string helpers shared by the item tag editor and the bulk editor.
// Extracted from TagInput.ts so modules under `bun test` can import them
// without dragging in Obsidian runtime symbols.

export function normalizeAreaTagInput(value: string): string | null {
	const normalized = value
		.trim()
		.replace(/^#+/, "")
		.replace(/,+$/, "")
		.replace(/\s+/g, "-");

	return normalized ? normalized : null;
}

export function parseTagInput(value: string): string[] {
	return value
		.split(",")
		.map((part) => normalizeAreaTagInput(part))
		.filter((tag): tag is string => Boolean(tag));
}

export function mergeTags(current: string[], additions: string[]): string[] {
	const next = [...current];
	const seen = new Set(current.map(canonicalTag));

	for (const addition of additions) {
		const tag = normalizeAreaTagInput(addition);
		if (!tag) continue;

		const key = canonicalTag(tag);
		if (seen.has(key)) continue;

		next.push(tag);
		seen.add(key);
	}

	return next;
}

export function sameTags(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

export function canonicalTag(tag: string): string {
	return tag.trim().replace(/^#+/, "").toLowerCase();
}
