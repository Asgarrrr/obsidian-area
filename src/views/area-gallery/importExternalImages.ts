import type { App } from "obsidian";
import type { AreaItem } from "../../types";
import {
	ensureVaultFolder,
	getUniqueAttachmentPath,
	normalizeVaultFolderPath,
} from "./attachmentPaths";
import {
	getImageExtensionForFile,
	isSupportedImageFile,
	readAspectRatio,
} from "./imageFileTypes";
import {
	createImportImageResult,
	getExistingVaultPaths,
	type ImportImageResult,
	type ImportImagesOptions,
} from "./importResult";
import { createThumbnail } from "./thumbnails";

export interface ImportExternalImagesOptions extends ImportImagesOptions {
	// Applied to every created item; callers pass it only for single-file
	// batches where the pairing is unambiguous.
	sourceUrl?: string;
}

/**
 * Copy images from outside the vault — drag-and-drop, paste, file picker — into
 * the area's attachments folder. Each file is isolated: a failure is recorded
 * and the batch continues.
 */
export async function importImageFiles(
	app: App,
	attachmentsDir: string,
	files: File[],
	existingItems: AreaItem[],
	options?: ImportExternalImagesOptions,
): Promise<ImportImageResult> {
	const adapter = app.vault.adapter;
	const existingVaultPaths = getExistingVaultPaths(existingItems);
	const result = createImportImageResult();
	const normalizedAttachmentsDir = normalizeVaultFolderPath(attachmentsDir);
	let ensuredAttachmentsDir = false;

	for (const [index, file] of files.entries()) {
		try {
			const name = getDisplayName(file.name, "Imported image");
			if (!isSupportedImageFile(file)) {
				result.unsupported.push({ name });
				continue;
			}

			try {
				if (!ensuredAttachmentsDir) {
					await ensureVaultFolder(adapter, normalizedAttachmentsDir);
					ensuredAttachmentsDir = true;
				}

				const ext = getImageExtensionForFile(file);
				const vaultPath = await getUniqueAttachmentPath(
					adapter,
					normalizedAttachmentsDir,
					`${crypto.randomUUID()}.${ext}`,
					existingVaultPaths,
				);
				const item = await createExternalImageItem(
					app,
					file,
					vaultPath,
					options?.sourceUrl,
				);
				item.thumbPath = await createThumbnail(
					app,
					item,
					normalizedAttachmentsDir,
				);
				existingVaultPaths.add(item.vaultPath);
				result.items.push(item);
			} catch (error) {
				result.failed.push({
					name,
					message:
						error instanceof Error ? error.message : "Could not import image.",
				});
			}
		} finally {
			options?.onProgress?.(index + 1, files.length);
		}
	}

	return result;
}

async function createExternalImageItem(
	app: App,
	file: File,
	vaultPath: string,
	sourceUrl?: string,
): Promise<AreaItem> {
	const buffer = await file.arrayBuffer();
	await app.vault.createBinary(vaultPath, buffer);

	return {
		id: crypto.randomUUID(),
		type: "image",
		vaultPath,
		tags: [],
		addedAt: Date.now(),
		title: getTitleFromFileName(file.name, "Imported image"),
		...(sourceUrl ? { sourceUrl } : {}),
		...(await readAspectRatio(file)),
	};
}

function getTitleFromFileName(filename: string, fallback: string): string {
	const name = getDisplayName(filename, fallback);
	const lastDot = name.lastIndexOf(".");
	if (lastDot <= 0) return name;
	return name.slice(0, lastDot).trim() || fallback;
}

function getDisplayName(name: string, fallback: string): string {
	return name.trim() || fallback;
}
