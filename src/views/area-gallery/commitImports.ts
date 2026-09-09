import { TFile, type App } from "obsidian";
import { parseAreaFile } from "../../areaFile";
import type { AreaItem } from "../../types";
import {
	findAreaGallery,
	type GallerySource,
} from "../item-detail/galleryBridge";
import type { ImportImageIssue, ImportImageResult } from "./importImages";
import { partitionImportedItems } from "./insertItems";
import { removeThumbnail } from "./thumbnails";

/**
 * Single write path for imported items. The destination is resolved at commit
 * time, not at invocation — imports await thumbnail work first, and the user
 * may have opened or closed the target meanwhile. An open gallery commits in
 * memory with a direct save() (never requestSave: its 2s debounce opens
 * last-writer-wins and background-kill windows — see the bulk-edit spec). A
 * closed file goes through Vault.process for an atomic read-modify-write.
 *
 * Items that don't land (duplicates, unwritable target) get their fresh
 * thumbnails removed; their imported binaries stay — deleting from
 * attachmentsDir on a heuristic is how user files get destroyed, and the
 * roadmap's "Find missing attachments" command is the planned sweeper.
 * The returned result reflects what actually happened so notices don't lie.
 */
export async function commitImportedItems(
	app: App,
	areaPath: string,
	result: ImportImageResult,
): Promise<ImportImageResult> {
	if (result.items.length === 0) return result;

	const gallery = findAreaGallery(app, areaPath);
	if (gallery) return commitThroughView(app, gallery, result);
	return commitThroughFile(app, areaPath, result);
}

async function commitThroughView(
	app: App,
	gallery: GallerySource,
	result: ImportImageResult,
): Promise<ImportImageResult> {
	if (!gallery.canModify()) {
		return abandonAll(app, result, "this area file is not editable");
	}

	const items = gallery.getAreaData().items;
	const { toAdd, skipped } = partitionImportedItems(items, result.items);
	items.unshift(...toAdd);

	if (toAdd.length > 0) {
		try {
			await gallery.save();
		} catch {
			// Memory already holds the new items; hand persistence to Obsidian's
			// debounced machinery rather than dropping them (bulk-edit precedent).
			gallery.requestSave();
		}
		gallery.notifyItemsChanged();
	}

	await removeThumbnails(app, skipped);
	return withOutcome(result, toAdd, skipped);
}

async function commitThroughFile(
	app: App,
	areaPath: string,
	result: ImportImageResult,
): Promise<ImportImageResult> {
	const file = app.vault.getAbstractFileByPath(areaPath);
	if (!(file instanceof TFile)) {
		return abandonAll(app, result, "area file not found");
	}

	let toAdd: AreaItem[] = [];
	let skipped: AreaItem[] = [];
	try {
		await app.vault.process(file, (data) => {
			// Parse inside the transaction: a concurrent commit changed `data`
			// since any earlier peek, and an unreadable file must throw here so
			// nothing is written.
			const areaFile = parseAreaFile(data);
			({ toAdd, skipped } = partitionImportedItems(
				areaFile.items,
				result.items,
			));
			areaFile.items.unshift(...toAdd);
			return JSON.stringify(areaFile, null, 2);
		});
	} catch {
		return abandonAll(app, result, "this area file could not be updated");
	}

	await removeThumbnails(app, skipped);
	return withOutcome(result, toAdd, skipped);
}

async function abandonAll(
	app: App,
	result: ImportImageResult,
	reason: string,
): Promise<ImportImageResult> {
	await removeThumbnails(app, result.items);
	return {
		...result,
		items: [],
		failed: [
			...result.failed,
			...result.items.map((item) => ({ ...toIssue(item), message: reason })),
		],
	};
}

function withOutcome(
	result: ImportImageResult,
	toAdd: AreaItem[],
	skipped: AreaItem[],
): ImportImageResult {
	return {
		...result,
		items: toAdd,
		skippedDuplicates: [...result.skippedDuplicates, ...skipped.map(toIssue)],
	};
}

function toIssue(item: AreaItem): ImportImageIssue {
	return { name: item.title ?? item.vaultPath, vaultPath: item.vaultPath };
}

async function removeThumbnails(app: App, items: AreaItem[]): Promise<void> {
	for (const item of items) {
		await removeThumbnail(app, item);
	}
}
