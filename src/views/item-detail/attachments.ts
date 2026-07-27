import { Notice, Platform, TFile, type App } from "obsidian";
import type { AreaItem } from "../../types";

interface FileExplorerLike {
	revealInFolder(file: TFile): void;
}

interface AppWithSystemFolder {
	showInFolder?: (path: string) => void;
}

interface AreaDetailAdapter {
	getFullPath?: (path: string) => string;
}

interface AppWithInternalPlugins {
	internalPlugins?: {
		getEnabledPluginById(id: string): FileExplorerLike | null;
	};
}

export function getAttachmentFile(app: App, item: AreaItem): TFile | null {
	const file = app.vault.getAbstractFileByPath(item.vaultPath);
	return file instanceof TFile ? file : null;
}

export function getFileName(path: string): string {
	return path.split("/").pop() ?? path;
}

export function canShowAttachmentInSystemFolder(app: App): boolean {
	return (
		Platform.isDesktopApp &&
		typeof getExtendedApp(app).showInFolder === "function"
	);
}

export async function openAttachment(
	app: App,
	item: AreaItem,
): Promise<boolean> {
	const file = getAttachmentFile(app, item);
	if (!file) {
		new Notice("Attachment not found");
		return false;
	}

	await app.workspace.getLeaf("tab").openFile(file);
	return true;
}

export function revealAttachment(app: App, item: AreaItem): boolean {
	const file = getAttachmentFile(app, item);
	if (!file) {
		new Notice("Attachment not found");
		return false;
	}

	const fileExplorer = getFileExplorer(app);
	if (!fileExplorer) {
		new Notice("Files core plugin is disabled");
		return false;
	}

	fileExplorer.revealInFolder(file);
	return true;
}

// Path-based on purpose: this is the one file action that still works when the
// attachment sits in a dot-folder Obsidian refuses to index, because it hands a
// filesystem path to the OS rather than looking up a TFile.
export function showAttachmentInSystemFolder(app: App, item: AreaItem): void {
	getExtendedApp(app).showInFolder?.(getFullPath(app, item.vaultPath));
}

function getExtendedApp(app: App): AppWithSystemFolder {
	return app as AppWithSystemFolder;
}

function getFullPath(app: App, path: string): string {
	const adapter = app.vault.adapter as AreaDetailAdapter;
	return adapter.getFullPath?.(path) ?? path;
}

function getFileExplorer(app: App): FileExplorerLike | null {
	const internalPlugins = (app as AppWithInternalPlugins).internalPlugins;
	const fileExplorer = internalPlugins?.getEnabledPluginById("file-explorer");
	if (fileExplorer) return fileExplorer;

	for (const leaf of app.workspace.getLeavesOfType("file-explorer")) {
		const view = leaf.view as Partial<FileExplorerLike>;
		if (typeof view.revealInFolder === "function") {
			return view as FileExplorerLike;
		}
	}

	return null;
}
