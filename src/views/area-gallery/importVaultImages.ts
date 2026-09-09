import type { App, TFile } from "obsidian";
import type { AreaItem } from "../../types";
import { normalizeVaultFolderPath } from "./attachmentPaths";
import { isSupportedVaultImageFile, readAspectRatio } from "./imageFileTypes";
import {
	createImportImageResult,
	getExistingVaultPaths,
	type ImportImageResult,
	type ImportImagesOptions,
} from "./importResult";
import { createThumbnail } from "./thumbnails";

/**
 * Reference images already in the vault. Nothing is copied: the item points at
 * the file where it lives, and only its thumbnail lands in the attachments
 * folder. Duplicates are dropped here so they skip thumbnail work.
 */
export async function importVaultImageFiles(
	app: App,
	attachmentsDir: string,
	files: TFile[],
	existingItems: AreaItem[],
	options?: ImportImagesOptions,
): Promise<ImportImageResult> {
	const existingVaultPaths = getExistingVaultPaths(existingItems);
	const result = createImportImageResult();
	const normalizedAttachmentsDir = normalizeVaultFolderPath(attachmentsDir);

	for (const [index, file] of files.entries()) {
		try {
			if (!isSupportedVaultImageFile(file)) {
				result.unsupported.push({ name: file.name, vaultPath: file.path });
				continue;
			}

			if (existingVaultPaths.has(file.path)) {
				result.skippedDuplicates.push({
					name: file.basename,
					vaultPath: file.path,
				});
				continue;
			}

			const item: AreaItem = {
				id: crypto.randomUUID(),
				type: "image",
				vaultPath: file.path,
				tags: [],
				addedAt: Date.now(),
				title: file.basename,
			};
			try {
				const bytes = await app.vault.adapter.readBinary(file.path);
				Object.assign(item, await readAspectRatio(new Blob([bytes])));
			} catch {
				// Unreadable here means the thumbnail path will surface it; the
				// card falls back to measuring on load either way.
			}

			item.thumbPath = await createThumbnail(
				app,
				item,
				normalizedAttachmentsDir,
			);

			existingVaultPaths.add(item.vaultPath);
			result.items.push(item);
		} finally {
			options?.onProgress?.(index + 1, files.length);
		}
	}

	return result;
}
