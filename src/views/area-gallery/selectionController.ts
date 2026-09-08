import { Notice } from "obsidian";
import type AreaPlugin from "../../main";
import type { AreaItem } from "../../types";
import type { AreaGalleryView } from "../AreaGalleryView";
import { BulkEditModal } from "../BulkEditModal";
import { ConfirmModal } from "../ConfirmModal";
import { getVaultTagSuggestions } from "../TagInput";
import { type BulkBarHandle, renderBulkBar } from "./bulkBar";
import { applyBulkPatch, type BulkPatch, summarizeSelection } from "./bulkEdit";
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
	// Set when a save() rejected after the patch already mutated memory: the next
	// apply must re-save even if the patch itself is a no-op by then.
	private saveFailed = false;

	constructor(
		private view: AreaGalleryView,
		private plugin: AreaPlugin,
	) {}

	// Bind to the bar element created on each full render.
	render(container: HTMLElement): void {
		this.handle = renderBulkBar({
			container,
			onClear: () => this.clear(),
			onEdit: () => this.openBulkEdit(),
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

	private openBulkEdit(): void {
		if (this.selected.size === 0) return;

		const areaData = this.view.getAreaData();
		const selectedItems = areaData.items.filter((item) =>
			this.selected.has(item.id),
		);
		if (selectedItems.length === 0) return;

		const schema = areaData.schema ?? [];
		new BulkEditModal(this.plugin.app, {
			summary: summarizeSelection(
				selectedItems,
				schema.map((def) => def.id),
			),
			schema,
			hiddenCount: countHiddenSelected(this.visibleItems, this.selected),
			getTagSuggestions: () => {
				const tags = new Set(getVaultTagSuggestions(this.plugin.app));
				for (const item of this.view.getAreaData().items) {
					for (const tag of item.tags) tags.add(tag);
				}
				return [...tags].sort((a, b) => a.localeCompare(b));
			},
			onApply: (patch) => this.applyPatch(patch),
			onClosed: () => {
				// The user walked away from the retry: the edit lives in memory
				// but not on disk. Say so — silence here is how data gets lost.
				if (this.saveFailed) {
					new Notice(
						"The last bulk edit is applied here but not saved to disk yet. It will be written with the next successful save.",
					);
				}
			},
		}).open();
	}

	// The commit path the spec pins down: fresh areaData at apply time (an
	// external reload replaces the object graph), canModify guard, direct
	// save() — requestSave's 2s debounce buys nothing after one atomic commit
	// and opens last-writer-wins and background-kill windows.
	private async applyPatch(patch: BulkPatch): Promise<void> {
		if (!this.view.canModify()) {
			// Throwing keeps the modal open with the draft intact (its catch path).
			throw new Error("This area file is not editable — nothing was changed.");
		}

		const areaData = this.view.getAreaData();
		// On a retry after a failed save, the patch already sits in memory and
		// applyBulkPatch reports 0 — the count must not read as "nothing done".
		const retrying = this.saveFailed;
		const changed = applyBulkPatch(areaData.items, this.selected, patch);

		if (changed > 0 || retrying) {
			try {
				await this.view.save();
				this.saveFailed = false;
			} catch (err) {
				this.saveFailed = true;
				// Memory did change; the grid must not keep painting stale tags,
				// and Obsidian's own debounced save machinery gets a chance to
				// persist what the direct save could not (it also flushes on
				// view close).
				this.view.notifyItemsChanged();
				this.view.requestSave();
				throw err;
			}
			this.view.notifyItemsChanged();
		}
		if (changed === 0 && retrying) new Notice("Changes saved.");
		else {
			new Notice(changed === 1 ? "Updated 1 item" : `Updated ${changed} items`);
		}
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
