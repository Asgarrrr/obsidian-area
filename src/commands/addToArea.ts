import {
	Notice,
	TFile,
	type App,
	type Menu,
	type TAbstractFile,
} from "obsidian";
import { FILE_EXT, VIEW_TYPE_AREA } from "../constants";
import type AreaPlugin from "../main";
import { parseAreaFile } from "../areaFile";
import type { AreaItem } from "../types";
import { commitImportedItems } from "../views/area-gallery/commitImports";
import { isSupportedVaultImageFile } from "../views/area-gallery/imageFileTypes";
import { showImportImageResultNotice } from "../views/area-gallery/importNotices";
import { createImportProgress } from "../views/area-gallery/importProgress";
import { importVaultImageFiles } from "../views/area-gallery/importVaultImages";
import { findAreaGallery } from "../views/item-detail/galleryBridge";
import { FileSuggestModal } from "../views/fileSuggest";
import { orderAreasByRecency } from "./areaOrdering";

// "Add current image to area…" from the palette, plus "Add to area…" on the
// file and multi-file context menus. All three funnel into the same pick →
// import → commit flow; the commit path (commitImports.ts) owns the open-view
// vs closed-file decision.
export function registerAddToArea(plugin: AreaPlugin): void {
	plugin.addCommand({
		id: "area:add-file-to-area",
		name: "Add current image to area…",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !isSupportedVaultImageFile(file)) return false;
			if (!checking) addFilesToArea(plugin, [file]);
			return true;
		},
	});

	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file) => {
			addMenuEntry(plugin, menu, [file]);
		}),
	);

	plugin.registerEvent(
		plugin.app.workspace.on("files-menu", (menu, files) => {
			addMenuEntry(plugin, menu, files);
		}),
	);
}

function addMenuEntry(
	plugin: AreaPlugin,
	menu: Menu,
	files: TAbstractFile[],
): void {
	// The events also fire for folders and non-image files.
	const images = files.filter(
		(f): f is TFile => f instanceof TFile && isSupportedVaultImageFile(f),
	);
	if (images.length === 0) return;

	menu.addItem((item) =>
		item
			.setTitle(
				images.length === 1
					? "Add to area…"
					: `Add ${images.length} images to area…`,
			)
			.setIcon("layout-grid")
			.onClick(() => addFilesToArea(plugin, images)),
	);
}

function addFilesToArea(plugin: AreaPlugin, images: TFile[]): void {
	pickTargetArea(plugin, (target) => {
		// Known failures fold into the result notice; this catch is for the
		// unexpected — without it they die as silent unhandled rejections.
		importInto(plugin, target.path, images).catch((error: unknown) => {
			console.error("Area: add to area failed", error);
			new Notice("Area: could not add the images.");
		});
	});
}

function pickTargetArea(
	plugin: AreaPlugin,
	onPick: (file: TFile) => void,
): void {
	const areas = plugin.app.vault
		.getFiles()
		.filter((f) => f.extension === FILE_EXT);
	if (areas.length === 0) {
		new Notice("No areas found. Use 'New area' to create one.");
		return;
	}

	if (plugin.settings.addToAreaTarget === "active-area") {
		const target = soleOpenAreaFile(plugin.app);
		if (target) {
			onPick(target);
			return;
		}
		// Zero or several open areas: guessing is how images land in the wrong
		// board — fall through to the modal.
	}

	const ordered = orderAreasByRecency(
		areas,
		plugin.app.workspace.getLastOpenFiles(),
	);
	new FileSuggestModal(plugin.app, ordered, onPick, "Add to area…").open();
}

function soleOpenAreaFile(app: App): TFile | null {
	const leaves = app.workspace.getLeavesOfType(VIEW_TYPE_AREA);
	const sole = leaves.length === 1 ? leaves[0] : undefined;
	if (!sole) return null;
	const path = (sole.view as { file?: TFile | null }).file?.path;
	const file = path ? app.vault.getAbstractFileByPath(path) : null;
	return file instanceof TFile ? file : null;
}

async function importInto(
	plugin: AreaPlugin,
	areaPath: string,
	images: TFile[],
): Promise<void> {
	const progress = createImportProgress(images.length);
	try {
		const result = await importVaultImageFiles(
			plugin.app,
			plugin.settings.attachmentsDir,
			images,
			await peekExistingItems(plugin.app, areaPath),
			{ onProgress: progress.onProgress },
		);
		showImportImageResultNotice(
			await commitImportedItems(plugin.app, areaPath, result),
		);
	} finally {
		progress.dispose();
	}
}

// Best-effort pre-import dedup so already-present images skip thumbnail work.
// Only a peek: the commit re-partitions against the state it actually writes.
async function peekExistingItems(
	app: App,
	areaPath: string,
): Promise<AreaItem[]> {
	const gallery = findAreaGallery(app, areaPath);
	if (gallery) return gallery.getAreaData().items;

	const file = app.vault.getAbstractFileByPath(areaPath);
	if (!(file instanceof TFile)) return [];
	try {
		return parseAreaFile(await app.vault.read(file)).items;
	} catch {
		return [];
	}
}
