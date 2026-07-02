import type { TFile } from "obsidian";

// Image-format detection: which files we accept, how to derive an extension,
// and a best-effort aspect-ratio probe.

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
	"avif",
	"bmp",
	"gif",
	"heic",
	"heif",
	"jpeg",
	"jpg",
	"png",
	"svg",
	"webp",
]);

export function isSupportedImageFile(file: File): boolean {
	return file.type.startsWith("image/") || isSupportedImageExtension(file.name);
}

export function isSupportedVaultImageFile(file: TFile): boolean {
	return SUPPORTED_IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

export function getImageExtensionFromMimeType(mimeType: string): string {
	switch (mimeType.toLowerCase()) {
		case "image/avif":
			return "avif";
		case "image/bmp":
			return "bmp";
		case "image/gif":
			return "gif";
		case "image/heic":
			return "heic";
		case "image/heif":
			return "heif";
		case "image/jpeg":
		case "image/jpg":
			return "jpg";
		case "image/svg+xml":
			return "svg";
		case "image/webp":
			return "webp";
		default:
			return "png";
	}
}

export function getImageExtensionForFile(file: File): string {
	const extension = getFileExtension(file.name);
	if (extension) {
		return extension;
	}
	return getImageExtensionFromMimeType(file.type);
}

export function getFileExtension(filename: string): string | null {
	const lastDot = filename.lastIndexOf(".");
	if (lastDot <= 0 || lastDot === filename.length - 1) return null;

	const extension = filename.slice(lastDot + 1).toLowerCase();
	const safeExtension = extension.replace(/[^a-z0-9]/g, "");
	return safeExtension || null;
}

// Decode the image just enough to record its aspect ratio, so masonry can size
// the card before the <img> loads. Best-effort: images the browser can't decode
// here (e.g. dimensionless SVGs) simply fall back to the measured-on-load path.
export async function readAspectRatio(
	blob: Blob,
): Promise<{ aspectRatio?: number }> {
	try {
		const bitmap = await createImageBitmap(blob);
		const { width, height } = bitmap;
		bitmap.close();
		if (width > 0 && height > 0) return { aspectRatio: width / height };
	} catch {
		// Undecodable via createImageBitmap — leave aspectRatio unset.
	}
	return {};
}

function isSupportedImageExtension(filename: string): boolean {
	const extension = getFileExtension(filename);
	return extension !== null && SUPPORTED_IMAGE_EXTENSIONS.has(extension);
}
