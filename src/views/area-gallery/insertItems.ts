import type { AreaItem } from "../../types";

// Pure so `bun test` can pin the dedup rule; both commit branches (open view
// and Vault.process) share it, which is what keeps their behavior identical.
export function partitionImportedItems(
	existing: AreaItem[],
	incoming: AreaItem[],
): { toAdd: AreaItem[]; skipped: AreaItem[] } {
	const seen = new Set(existing.map((item) => item.vaultPath));
	const toAdd: AreaItem[] = [];
	const skipped: AreaItem[] = [];

	for (const item of incoming) {
		if (seen.has(item.vaultPath)) {
			skipped.push(item);
			continue;
		}
		seen.add(item.vaultPath);
		toAdd.push(item);
	}

	return { toAdd, skipped };
}
