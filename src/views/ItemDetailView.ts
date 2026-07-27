import { ItemView, Menu, type WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_AREA_DETAIL } from "../constants";
import type AreaPlugin from "../main";
import type { AreaFile, AreaItem } from "../types";
import { removeThumbnail } from "./area-gallery/thumbnails";
import { ConfirmModal } from "./ConfirmModal";
import { DetailSidebar } from "./item-detail/detailSidebar";
import { findAreaGallery } from "./item-detail/galleryBridge";
import { getFileName } from "./item-detail/attachments";
import type { ItemDetailPayload } from "./item-detail/openItemDetail";
import { clamp, iconButton } from "./item-detail/viewHelpers";

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

		this.contentEl.empty();

		const toolbar = this.contentEl.createDiv("area-detail-view-toolbar");
		this.renderToolbar(toolbar, item);

		const body = this.contentEl.createDiv("area-detail-view-body");
		const stage = this.renderStage(body, item);

		if (this.siblingIds.length > 1) {
			this.renderStageNav(stage);
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

	private renderToolbar(toolbar: HTMLElement, item: AreaItem): void {
		// The bar was 48px of empty space with two icons pinned to the right; the
		// item's own name is the obvious thing to put in it.
		const title = toolbar.createDiv({
			cls: "area-detail-view-title",
			text: item.title?.trim() || getFileName(item.vaultPath),
		});
		title.setAttribute("title", item.vaultPath);

		const actions = toolbar.createDiv("area-detail-view-actions");
		// Delete lives behind the overflow menu rather than one icon away from
		// Close, where a mis-aimed click used to land on a destructive action.
		iconButton(actions, "more-horizontal", "More actions", (evt) => {
			const menu = new Menu();
			menu.addItem((menuItem) =>
				menuItem
					.setIcon("trash-2")
					.setTitle("Remove from area")
					.onClick(() => this.confirmDelete(item)),
			);
			menu.showAtMouseEvent(evt);
		});

		iconButton(actions, "x", "Close", () => this.leaf.detach());
	}

	private renderStage(container: HTMLElement, item: AreaItem): HTMLElement {
		const stage = container.createDiv("area-detail-stage");
		const img = stage.createEl("img", { cls: "area-detail-stage-img" });
		// Always the original here: the stage is the one place the full resolution
		// is worth paying for.
		img.src = this.app.vault.adapter.getResourcePath(item.vaultPath);
		img.alt = item.title ?? "";
		img.decoding = "async";
		img.draggable = false;
		return stage;
	}

	// ←/→ worked, but nothing on screen was clickable, so paging through a board
	// was keyboard-only.
	private renderStageNav(stage: HTMLElement): void {
		const prev = iconButton(stage, "chevron-left", "Previous image", () =>
			this.setIndex(this.index - 1),
		);
		prev.buttonEl.addClass("area-detail-stage-nav");
		prev.buttonEl.addClass("area-detail-stage-nav--prev");
		prev.setDisabled(this.index === 0);

		const next = iconButton(stage, "chevron-right", "Next image", () =>
			this.setIndex(this.index + 1),
		);
		next.buttonEl.addClass("area-detail-stage-nav");
		next.buttonEl.addClass("area-detail-stage-nav--next");
		next.setDisabled(this.index === this.siblingIds.length - 1);
	}

	private confirmDelete(item: AreaItem): void {
		new ConfirmModal(this.app, {
			title: "Remove from area",
			message: `${item.title?.trim() || getFileName(item.vaultPath)}\n\nThe image file stays in your vault.`,
			confirmText: "Remove",
			onConfirm: () => this.deleteCurrent(),
		}).open();
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
		// The original stays in the vault by design; its generated thumbnail is
		// ours, so nothing else will ever clean it up.
		void removeThumbnail(this.app, item);
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
