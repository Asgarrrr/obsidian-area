import { Notice, Platform, TFile, type App } from "obsidian";
import type { AreaItem } from "../../types";

interface FileExplorerLike {
	revealInFolder(file: TFile): void;
}

interface AreaDetailApp extends App {
	internalPlugins?: {
		getEnabledPluginById(id: "file-explorer"): FileExplorerLike | null;
	};
	showInFolder?: (path: string) => void;
}

interface AreaDetailAdapter {
	getFullPath?: (path: string) => string;
}

export function getAttachmentFile(app: App, item: AreaItem): TFile | null {
	const file = app.vault.getAbstractFileByPath(item.vaultPath);
	return file instanceof TFile ? file : null;
}

export function getFileName(path: string): string {
	return path.split("/").pop() ?? path;
}

export function getShortPath(path: string): string {
	const parts = path.split("/");
	if (parts.length <= 2) return path;

	const parent = parts[parts.length - 2] ?? "";
	const name = parts[parts.length - 1] ?? path;
	return parent ? `${parent}/${name}` : name;
}

export function canShowAttachmentInSystemFolder(app: App): boolean {
	return Platform.isDesktopApp && typeof getExtendedApp(app).showInFolder === "function";
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

export function showAttachmentInSystemFolder(app: App, item: AreaItem): boolean {
	const file = getAttachmentFile(app, item);
	if (!file) {
		new Notice("Attachment not found");
		return false;
	}

	getExtendedApp(app).showInFolder?.(getFullPath(app, file.path));
	return true;
}

function getExtendedApp(app: App): AreaDetailApp {
	return app as AreaDetailApp;
}

function getFullPath(app: App, path: string): string {
	const adapter = app.vault.adapter as AreaDetailAdapter;
	return adapter.getFullPath?.(path) ?? path;
}

function getFileExplorer(app: App): FileExplorerLike | null {
	const fileExplorer =
		getExtendedApp(app).internalPlugins?.getEnabledPluginById("file-explorer");
	if (fileExplorer) return fileExplorer;

	for (const leaf of app.workspace.getLeavesOfType("file-explorer")) {
		const view = leaf.view as Partial<FileExplorerLike>;
		if (typeof view.revealInFolder === "function") {
			return view as FileExplorerLike;
		}
	}

	return null;
}
