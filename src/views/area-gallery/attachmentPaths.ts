import { normalizePath, type DataAdapter } from "obsidian";
import { getFileExtension } from "./imageFileTypes";

// Vault-path plumbing for the attachments folder. Adapter-only on purpose: the
// folder is dot-prefixed by default and invisible to the TFile APIs.

export function normalizeVaultFolderPath(folderPath: string): string {
	return normalizePath(folderPath).replace(/\/$/, "");
}

/** Create `folderPath` and every missing parent. `adapter.mkdir` makes one level. */
export async function ensureVaultFolder(
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

/**
 * Resolve a free path under `attachmentsDir`, re-rolling the UUID on collision.
 * Checks `existingVaultPaths` as well as the disk: paths minted earlier in the
 * same batch are not written yet when the next file is placed.
 */
export async function getUniqueAttachmentPath(
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
