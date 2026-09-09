import {
	normalizePath,
	type App,
	type DataAdapter,
	type TFile,
} from "obsidian";
import type { AreaItem } from "../../types";
import {
	getFileExtension,
	getImageExtensionForFile,
	isSupportedImageFile,
	isSupportedVaultImageFile,
	readAspectRatio,
} from "./imageFileTypes";
import { createThumbnail } from "./thumbnails";

export interface ImportImageIssue {
	name: string;
	vaultPath?: string;
	message?: string;
}

export interface ImportImageResult {
	items: AreaItem[];
	skippedDuplicates: ImportImageIssue[];
	unsupported: ImportImageIssue[];
	failed: ImportImageIssue[];
}

export interface ImportImagesOptions {
	onProgress?: (done: number, total: number) => void;
	// Applied to every created item; callers pass it only for single-file
	// batches where the pairing is unambiguous.
	sourceUrl?: string;
}

export async function importImageFiles(
	app: App,
	attachmentsDir: string,
	files: File[],
	existingItems: AreaItem[],
	options?: ImportImagesOptions,
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

			// The image stays where it is in the vault; only its thumbnail is
			// written into the area's attachments folder.
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

export function hasAreaItemWithVaultPath(
	items: AreaItem[],
	vaultPath: string,
): boolean {
	return items.some((item) => item.vaultPath === vaultPath);
}

function createImportImageResult(): ImportImageResult {
	return {
		items: [],
		skippedDuplicates: [],
		unsupported: [],
		failed: [],
	};
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

function getExistingVaultPaths(items: AreaItem[]): Set<string> {
	return new Set(items.map((item) => item.vaultPath));
}

async function getUniqueAttachmentPath(
	adapter: DataAdapter,
	attachmentsDir: string,
	filename: string,
	existingVaultPaths: Set<string>,
): Promise<string> {
	let candidate = normalizePath(`${attachmentsDir}/${filename}`);
	while (
		existingVaultPaths.has(candidate) ||
		(await adapter.exists(candidate))
	) {
		const ext = getFileExtension(filename) ?? "png";
		candidate = normalizePath(
			`${attachmentsDir}/${crypto.randomUUID()}.${ext}`,
		);
	}
	return candidate;
}

async function ensureVaultFolder(
	adapter: DataAdapter,
	folderPath: string,
): Promise<void> {
	if (!folderPath) return;

	const parts = folderPath.split("/").filter(Boolean);
	let currentPath = "";

	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		if (!(await adapter.exists(currentPath))) {
			await adapter.mkdir(currentPath);
		}
	}
}

function normalizeVaultFolderPath(folderPath: string): string {
	return normalizePath(folderPath).replace(/\/$/, "");
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
