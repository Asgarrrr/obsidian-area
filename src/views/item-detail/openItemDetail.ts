import type { App } from "obsidian";
import { VIEW_TYPE_AREA_DETAIL } from "../../constants";
import { ItemDetailView } from "../ItemDetailView";

export interface ItemDetailPayload {
	// Everything the view needs is serializable: it re-resolves the live gallery
	// (by file path) and the current item (by id) on every action, so a closed or
	// externally-reloaded gallery can never leave it editing orphaned data.
	areaPath: string;
	siblingIds: string[];
	index: number;
}

/**
 * Open (or reuse) the detail tab for a gallery item. A single detail leaf is
 * reused so paging through cards doesn't spawn a tab per click.
 */
export async function openItemDetailView(
	app: App,
	payload: ItemDetailPayload,
): Promise<void> {
	const existing = app.workspace.getLeavesOfType(VIEW_TYPE_AREA_DETAIL)[0];
	const leaf = existing ?? app.workspace.getLeaf(true);
	await leaf.setViewState({ type: VIEW_TYPE_AREA_DETAIL, active: true });
	app.workspace.revealLeaf(leaf);

	if (leaf.view instanceof ItemDetailView) {
		leaf.view.bindPayload(payload);
	}
}
