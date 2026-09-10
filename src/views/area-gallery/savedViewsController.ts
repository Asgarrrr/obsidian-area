import type { App } from "obsidian";
import { Notice } from "obsidian";
import type { AreaFile, AreaSavedView } from "../../types";
import { ConfirmModal } from "../ConfirmModal";
import { PromptModal } from "../PromptModal";
import {
	applySavedView,
	captureSavedView,
	isSavedViewDirty,
	normalizeSavedViews,
	removeSavedView,
	type ToolbarFilterState,
	unrepresentableFilters,
	upsertSavedView,
} from "./savedViews";

// Owns which saved view is selected and every write to `areaData.views`.
// Split out of GalleryToolbarController so that class keeps to filter state.

interface SavedViewsHost {
	getAreaData(): AreaFile;
	canModify(): boolean;
	requestSave(): void;
}

interface SavedViewsBridge {
	// Reads the filters as they stand right now.
	capture(): ToolbarFilterState;
	// Pushes a restored state back into the toolbar, then repaints.
	restore(state: ToolbarFilterState): void;
	// Repaints without touching the filters — after a rename or a delete.
	refresh(): void;
}

export class SavedViewsController {
	private activeViewId: string | null = null;

	constructor(
		private app: App,
		private host: SavedViewsHost,
		private bridge: SavedViewsBridge,
	) {}

	getViews(): AreaSavedView[] {
		return normalizeSavedViews(this.host.getAreaData().views);
	}

	// Whether an action like "Update this view" has a target. Distinct from
	// getActiveId(), which reports what the picker should *display* and goes
	// null on drift — updating a drifted view is exactly the point.
	hasManagedView(): boolean {
		return this.findActive() !== undefined;
	}

	// Null once the filters drift, so the picker stops presenting a modified
	// board as the saved one.
	getActiveId(): string | null {
		const active = this.findActive();
		if (!active) return null;
		return isSavedViewDirty(active, this.bridge.capture()) ? null : active.id;
	}

	select(id: string | null): void {
		this.activeViewId = id;
		const view = this.findActive();
		if (!view) {
			this.bridge.restore({
				searchQuery: "",
				activeTagFilters: new Set(),
				activeFieldValues: new Map(),
				sort: { type: "newest" },
			});
			return;
		}
		this.bridge.restore(applySavedView(view));
	}

	saveAsNew(): void {
		new PromptModal(this.app, {
			title: "Save current filters as a view",
			placeholder: "View name",
			confirmText: "Save",
			onSubmit: (label) => {
				const view = captureSavedView(
					crypto.randomUUID(),
					label,
					this.bridge.capture(),
				);
				if (!this.commit((views) => upsertSavedView(views, view))) return;
				this.activeViewId = view.id;
				this.bridge.refresh();
				new Notice(`Saved view “${view.label}”.`);
			},
		}).open();
	}

	updateActive(): void {
		const active = this.findActive();
		if (!active) return;
		const updated = captureSavedView(
			active.id,
			active.label,
			this.bridge.capture(),
			unrepresentableFilters(active),
		);
		if (!this.commit((views) => upsertSavedView(views, updated))) return;
		this.bridge.refresh();
		new Notice(`Updated “${updated.label}”.`);
	}

	renameActive(): void {
		const active = this.findActive();
		if (!active) return;
		new PromptModal(this.app, {
			title: "Rename this view",
			initialValue: active.label,
			confirmText: "Rename",
			onSubmit: (label) => {
				const renamed = { ...active, label };
				if (!this.commit((views) => upsertSavedView(views, renamed))) return;
				this.bridge.refresh();
			},
		}).open();
	}

	deleteActive(): void {
		const active = this.findActive();
		if (!active) return;
		new ConfirmModal(this.app, {
			title: "Delete this view",
			message: `“${active.label}” will be removed from this area. The items it filtered are not touched.`,
			confirmText: "Delete",
			onConfirm: () => {
				if (!this.commit((views) => removeSavedView(views, active.id))) return;
				// Deleting the selection drops back to the unsaved default, but the
				// filters it restored stay on screen — nothing was destroyed.
				this.activeViewId = null;
				this.bridge.refresh();
			},
		}).open();
	}

	private findActive(): AreaSavedView | undefined {
		if (this.activeViewId === null) return undefined;
		return this.getViews().find((view) => view.id === this.activeViewId);
	}

	// Every write goes through here: re-read the file, refuse when it couldn't
	// be parsed, and drop the key entirely when the last view goes so an area
	// that never had saved views stays byte-identical.
	private commit(mutate: (views: AreaSavedView[]) => AreaSavedView[]): boolean {
		if (!this.host.canModify()) {
			new Notice("Area: this file couldn't be read — it won't be modified.");
			return false;
		}

		const areaData = this.host.getAreaData();
		const next = mutate(normalizeSavedViews(areaData.views));
		if (next.length === 0) delete areaData.views;
		else areaData.views = next;

		this.host.requestSave();
		return true;
	}
}
