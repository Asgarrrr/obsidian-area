import {
	ButtonComponent,
	ItemView,
	Notice,
	type WorkspaceLeaf,
} from "obsidian";
import { VIEW_TYPE_AREA_DETAIL } from "../constants";
import type AreaPlugin from "../main";
import type { AreaFile, AreaItem } from "../types";
import { DetailSidebar } from "./item-detail/detailSidebar";
import { findAreaGallery } from "./item-detail/galleryBridge";
import type { ItemDetailPayload } from "./item-detail/openItemDetail";
import { clamp, iconButton } from "./item-detail/viewHelpers";

const DELETE_CONFIRM_MS = 4000;
const EMPTY_AREA: AreaFile = { version: "1", name: "", items: [] };
// Toggled on containerEl (.workspace-leaf-content); a CSS rule hides its direct
// child .view-header — Obsidian's own header bar — when the setting is on.
const HIDE_HEADER_CLASS = "area-detail-hide-header";

/**
 * Full-tab detail view for a single area item: large image on the left, the
 * editable "Details" panel on the right, and a counter pill to page through the
 * gallery's selection with ←/→. It never captures the gallery's data — it
 * resolves the live gallery (by path) and item (by id) on demand.
 */
export class ItemDetailView extends ItemView {
	private areaPath = "";
	private siblingIds: string[] = [];
	private index = 0;
	private sidebar: DetailSidebar | null = null;
	private deleteConfirmPending = false;
	private deleteConfirmTimer: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: AreaPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_AREA_DETAIL;
	}

	getDisplayText(): string {
		return this.currentItem()?.title || "Area item";
	}

	getIcon(): string {
		return "image";
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("area-detail-view");
		this.applyHeaderVisibility();
		// Full-bleed: neutralise Obsidian's default .view-content padding inline so
		// the layout reaches the pane edges without a stylesheet override that
		// mirrors (and couples to) the core selector's shape or specificity.
		this.contentEl.style.padding = "0";

		// A leaf restored at startup has no binding yet — nothing to render, so
		// close it rather than leave an empty tab. Fresh opens happen after layout
		// is ready, so they're unaffected.
		if (!this.app.workspace.layoutReady) {
			this.leaf.detach();
			return;
		}

		this.contentEl.tabIndex = -1;
		this.registerDomEvent(this.contentEl, "keydown", (evt) =>
			this.onKeyDown(evt),
		);
		// When the backing gallery tab closes, the detail view has nothing live to
		// edit — close it too rather than silently no-op every edit.
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				if (this.areaPath && !this.gallery()) this.leaf.detach();
			}),
		);

		this.sidebar = new DetailSidebar({
			app: this.app,
			getAreaData: () => this.gallery()?.getAreaData() ?? EMPTY_AREA,
			getCurrentItem: () => this.currentItem(),
			onDataChanged: () => this.gallery()?.requestSave(),
			onTagsChanged: () => this.gallery()?.notifyItemsChanged(),
		});

		if (this.siblingIds.length > 0) this.renderCurrent();
	}

	async onClose(): Promise<void> {
		this.clearDeleteConfirm();
		this.sidebar?.dispose();
		this.sidebar = null;
		this.contentEl.empty();
	}

	/** Show/hide Obsidian's own view-header on this leaf per the user setting. */
	applyHeaderVisibility(): void {
		this.containerEl.toggleClass(
			HIDE_HEADER_CLASS,
			this.plugin.settings.hideDetailHeader,
		);
	}

	bindPayload(payload: ItemDetailPayload): void {
		this.areaPath = payload.areaPath;
		this.siblingIds = payload.siblingIds;
		this.index = clamp(payload.index, 0, payload.siblingIds.length - 1);
		this.renderCurrent();
	}

	private renderCurrent(): void {
		const gallery = this.gallery();
		const item = this.currentItem();
		if (!gallery || !item || !this.sidebar) {
			this.leaf.detach();
			return;
		}

		this.clearDeleteConfirm();
		this.contentEl.empty();

		const toolbar = this.contentEl.createDiv("area-detail-view-toolbar");
		this.renderToolbar(toolbar);

		const body = this.contentEl.createDiv("area-detail-view-body");
		const stage = this.renderStage(body, item);

		if (this.siblingIds.length > 1) {
			const hint = stage.createDiv("area-detail-view-hint");
			hint.createSpan({
				cls: "area-detail-view-hint-count",
				text: `${this.index + 1} / ${this.siblingIds.length}`,
			});
			hint.createSpan({ cls: "area-detail-view-hint-sep", text: "·" });
			hint.createSpan({
				cls: "area-detail-view-hint-text",
				text: "← → to navigate",
			});
		}

		const sidebarEl = body.createDiv("area-detail-sidebar");
		this.sidebar.render(sidebarEl);

		this.contentEl.focus();
	}

	private renderToolbar(toolbar: HTMLElement): void {
		const actions = toolbar.createDiv("area-detail-view-actions");
		const deleteButton = iconButton(actions, "trash-2", "Delete image", () =>
			this.handleDeleteClick(deleteButton),
		);
		deleteButton.buttonEl.addClass("area-detail-toolbar-danger");

		iconButton(actions, "x", "Close", () => this.leaf.detach());
	}

	private renderStage(container: HTMLElement, item: AreaItem): HTMLElement {
		const stage = container.createDiv("area-detail-stage");
		const img = stage.createEl("img", { cls: "area-detail-stage-img" });
		img.src = this.app.vault.adapter.getResourcePath(item.vaultPath);
		img.alt = item.title ?? "";
		img.decoding = "async";
		img.draggable = false;
		return stage;
	}

	private handleDeleteClick(button: ButtonComponent): void {
		if (this.deleteConfirmPending) {
			this.deleteCurrent();
			return;
		}

		this.deleteConfirmPending = true;
		button.buttonEl.addClass("is-confirming");
		button.setTooltip("Click again to delete");
		new Notice("Click again to delete. The attachment stays in your vault.");

		this.deleteConfirmTimer = window.setTimeout(() => {
			this.deleteConfirmTimer = null;
			this.deleteConfirmPending = false;
			button.buttonEl.removeClass("is-confirming");
			button.setTooltip("Delete image");
		}, DELETE_CONFIRM_MS);
	}

	private clearDeleteConfirm(): void {
		if (this.deleteConfirmTimer !== null) {
			window.clearTimeout(this.deleteConfirmTimer);
			this.deleteConfirmTimer = null;
		}
		this.deleteConfirmPending = false;
	}

	private setIndex(next: number): void {
		const clamped = clamp(next, 0, this.siblingIds.length - 1);
		if (clamped === this.index) return;
		this.index = clamped;
		this.renderCurrent();
	}

	private deleteCurrent(): void {
		const gallery = this.gallery();
		const item = this.currentItem();
		if (!gallery || !item) {
			this.leaf.detach();
			return;
		}

		const items = gallery.getAreaData().items;
		const dataIndex = items.findIndex((candidate) => candidate.id === item.id);
		if (dataIndex !== -1) items.splice(dataIndex, 1);
		this.siblingIds.splice(this.index, 1);
		gallery.requestSave();
		gallery.notifyItemsChanged();

		if (this.siblingIds.length === 0) {
			this.leaf.detach();
			return;
		}
		this.index = Math.min(this.index, this.siblingIds.length - 1);
		this.renderCurrent();
	}

	private onKeyDown(evt: KeyboardEvent): void {
		const target = evt.target as HTMLElement | null;
		if (
			target &&
			(target.matches("input, textarea, select") || target.isContentEditable)
		) {
			return;
		}

		if (evt.key === "ArrowLeft") {
			evt.preventDefault();
			this.setIndex(this.index - 1);
		} else if (evt.key === "ArrowRight") {
			evt.preventDefault();
			this.setIndex(this.index + 1);
		}
	}

	private currentItem(): AreaItem | null {
		const gallery = this.gallery();
		if (!gallery) return null;
		const id = this.siblingIds[this.index];
		if (id === undefined) return null;
		return gallery.getAreaData().items.find((it) => it.id === id) ?? null;
	}

	private gallery() {
		return findAreaGallery(this.app, this.areaPath);
	}
}
