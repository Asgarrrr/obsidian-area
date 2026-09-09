import type { AreaItem } from "../../types";

export interface ImportImageIssue {
	name: string;
	vaultPath?: string;
	message?: string;
}

// Every import source reports through this shape, which is what lets
// importNotices and commitImports stay indifferent to where images came from.
export interface ImportImageResult {
	items: AreaItem[];
	skippedDuplicates: ImportImageIssue[];
	unsupported: ImportImageIssue[];
	failed: ImportImageIssue[];
}

export interface ImportImagesOptions {
	onProgress?: (done: number, total: number) => void;
}

export function createImportImageResult(): ImportImageResult {
	return {
		items: [],
		skippedDuplicates: [],
		unsupported: [],
		failed: [],
	};
}

// Seeded from the area's current items, then grown as the loop creates items:
// a batch must not collide with itself either.
export function getExistingVaultPaths(items: AreaItem[]): Set<string> {
	return new Set(items.map((item) => item.vaultPath));
}
