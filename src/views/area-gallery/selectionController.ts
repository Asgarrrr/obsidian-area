import { Notice } from "obsidian";
import type AreaPlugin from "../../main";
import type { AreaItem } from "../../types";
import type { AreaGalleryView } from "../AreaGalleryView";
import { ConfirmModal } from "../ConfirmModal";
import { type BulkBarHandle, renderBulkBar } from "./bulkBar";
import {
	countHiddenSelected,
	partitionSelected,
	pruneSelection,
} from "./selection";
import { removeThumbnail } from "./thumbnails";

// Owns which items are ticked and the bulk actions that run against them. The
// view keeps the state here rather than inline so it stays a lifecycle shell.
export class SelectionController {
	private selected = new Set<string>();
	private handle: BulkBarHandle | null = null;
	// The list the grid last rendered, kept so the bar can report how many
	// selected items the filters are hiding without re-running them.
	private visibleItems: AreaItem[] = [];

	constructor(
		private view: AreaGalleryView,
		private plugin: AreaPlugin,
	) {}

	// Bind to the bar element created on each full render.
	render(container: HTMLElement): void {
		this.handle = renderBulkBar({
			container,
			onClear: () => this.clear(),
			onRemove: () => this.confirmRemove(),
		});
	}

	isSelected(id: string): boolean {
		return this.selected.has(id);
	}

	toggle(id: string): void {
		if (this.selected.has(id)) this.selected.delete(id);
		else this.selected.add(id);
		this.syncBar();
	}

	// Repaints every card, because clearing has to untick the ones the user isn't
	// pointing at — the per-card toggle path can only update its own checkbox.
	clear(): void {
		if (this.selected.size === 0) return;
		this.selected.clear();
		this.view.rerenderGrid();
	}

	// Drop the state and the handle on a render that builds no bar, so nothing
	// later writes counts into a detached element.
	reset(): void {
		this.selected.clear();
		this.visibleItems = [];
		this.handle = null;
	}

	// Called after any change to the item list: an import or a delete elsewhere
	// can strip an id the selection still holds.
	prune(items: AreaItem[]): void {
		if (pruneSelection(this.selected, items)) this.syncBar();
	}

	/** Refresh the counts against the list the grid just rendered. */
	syncCounts(visible: AreaItem[]): void {
		this.visibleItems = visible;
		this.syncBar();
	}

	private syncBar(): void {
		this.handle?.update(
			this.selected.size,
			countHiddenSelected(this.visibleItems, this.selected),
		);
	}

	private confirmRemove(): void {
		const count = this.selected.size;
		if (count === 0) return;

		const label = count === 1 ? "1 item" : `${count} items`;
		new ConfirmModal(this.plugin.app, {
			title: "Remove from area",
			message: `${label} will be removed from this area.\n\nThe image files stay in your vault.`,
			confirmText: "Remove",
			onConfirm: () => this.removeSelected(),
		}).open();
	}

	private removeSelected(): void {
		const areaData = this.view.getAreaData();
		const { kept, removed } = partitionSelected(areaData.items, this.selected);
		if (removed.length === 0) return;

		areaData.items = kept;
		this.selected.clear();
		// The originals stay in the vault by design; the generated thumbnails are
		// ours, so nothing else would ever clean them up.
		for (const item of removed) void removeThumbnail(this.plugin.app, item);

		this.view.requestSave();
		this.view.notifyItemsChanged();
		new Notice(
			`Removed ${removed.length === 1 ? "1 item" : `${removed.length} items`} from the area.`,
		);
	}
}
