import {
	getImageExtensionFromMimeType,
	isSupportedImageFile,
} from "./importImages";

export function getClipboardImageFiles(event: ClipboardEvent): File[] {
	const clipboardData = event.clipboardData;
	if (!clipboardData) return [];

	const files: File[] = [];
	const items = Array.from(clipboardData.items);
	for (const [index, item] of items.entries()) {
		if (item.kind !== "file") continue;

		const file = item.getAsFile();
		if (!file) continue;
		if (!item.type.startsWith("image/") && !isSupportedImageFile(file)) {
			continue;
		}

		files.push(ensureClipboardFileName(file, item.type, index));
	}

	if (files.length > 0) return files;

	return Array.from(clipboardData.files)
		.filter(isSupportedImageFile)
		.map((file, index) => ensureClipboardFileName(file, file.type, index));
}

function ensureClipboardFileName(
	file: File,
	mimeType: string,
	index: number,
): File {
	if (file.name.trim()) return file;

	const extension = getImageExtensionFromMimeType(file.type || mimeType);
	const suffix = index > 0 ? ` ${index + 1}` : "";
	return new File([file], `Pasted image${suffix}.${extension}`, {
		type: file.type || mimeType,
		lastModified: file.lastModified || Date.now(),
	});
}
