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

export async function importImageFiles(
	app: App,
	attachmentsDir: string,
	files: File[],
	existingItems: AreaItem[],
): Promise<ImportImageResult> {
	const adapter = app.vault.adapter;
	const existingVaultPaths = getExistingVaultPaths(existingItems);
	const result = createImportImageResult();
	const normalizedAttachmentsDir = normalizeVaultFolderPath(attachmentsDir);
	let ensuredAttachmentsDir = false;

	for (const file of files) {
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
			const item = await createExternalImageItem(app, file, vaultPath);
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
	}

	return result;
}

export async function importVaultImageFiles(
	app: App,
	attachmentsDir: string,
	files: TFile[],
	existingItems: AreaItem[],
): Promise<ImportImageResult> {
	const existingVaultPaths = getExistingVaultPaths(existingItems);
	const result = createImportImageResult();
	const normalizedAttachmentsDir = normalizeVaultFolderPath(attachmentsDir);

	for (const file of files) {
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
		// The image stays where it is in the vault; only its thumbnail is written
		// into the area's attachments folder.
		item.thumbPath = await createThumbnail(app, item, normalizedAttachmentsDir);

		existingVaultPaths.add(item.vaultPath);
		result.items.push(item);
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
