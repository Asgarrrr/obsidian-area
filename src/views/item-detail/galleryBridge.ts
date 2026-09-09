import type { App, TFile } from "obsidian";
import { VIEW_TYPE_AREA } from "../../constants";
import type { AreaFile } from "../../types";

/**
 * The subset of AreaGalleryView the detail view drives. It is resolved live by
 * file path on every action rather than captured once, so the detail view never
 * holds a stale reference: the gallery swaps its `areaData` object on external
 * file reload, and its save/refresh callbacks die when its tab closes.
 */
export interface GallerySource {
	file: TFile | null;
	getAreaData(): AreaFile;
	// False while the underlying file couldn't be parsed — a commit through the
	// view must refuse rather than save a phantom AreaFile.
	canModify(): boolean;
	// Direct save for atomic external commits; requestSave stays for callers
	// that batch user edits (detail view).
	save(): Promise<void>;
	requestSave(): void;
	notifyItemsChanged(): void;
}

/** The open gallery view backing `areaPath`, or null if none is open. */
export function findAreaGallery(
	app: App,
	areaPath: string,
): GallerySource | null {
	if (!areaPath) return null;
	for (const leaf of app.workspace.getLeavesOfType(VIEW_TYPE_AREA)) {
		const view = leaf.view as unknown as GallerySource;
		if (view.file?.path === areaPath) return view;
	}
	return null;
}
