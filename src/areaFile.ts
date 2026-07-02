import type { AreaFile } from "./types";

// Throws if `data` isn't an Area board; the view round-trips unreadable bytes
// verbatim rather than overwriting a recoverable file (see AreaGalleryView).
// Only the `items` array is required — every other field is preserved as-is.
export function parseAreaFile(data: string): AreaFile {
	const parsed: unknown = JSON.parse(data);
	if (!isAreaFileShape(parsed)) {
		throw new Error("Not an Area file: expected an object with an items array");
	}
	return parsed;
}

function isAreaFileShape(value: unknown): value is AreaFile {
	if (typeof value !== "object" || value === null) return false;
	const items = (value as { items?: unknown }).items;
	// Every item must carry the fields the gallery/detail render dereference
	// unguarded (id, vaultPath, tags). A file whose items are primitives or
	// missing these would otherwise parse "successfully" then crash mid-render;
	// failing the shape check routes it to the safe read-only round-trip path.
	return Array.isArray(items) && items.every(isAreaItemShape);
}

function isAreaItemShape(item: unknown): boolean {
	if (typeof item !== "object" || item === null) return false;
	const shape = item as Record<string, unknown>;
	return (
		typeof shape.id === "string" &&
		typeof shape.vaultPath === "string" &&
		Array.isArray(shape.tags)
	);
}
