import { Notice, type TFile } from "obsidian";
import type AreaPlugin from "../../main";
import type { AreaGalleryView } from "../AreaGalleryView";
import { getClipboardImageFiles } from "./clipboard";
import { commitImportedItems } from "./commitImports";
import { importImageFiles } from "./importExternalImages";
import { showImportImageResultNotice } from "./importNotices";
import { createImportProgress } from "./importProgress";
import { importVaultImageFiles } from "./importVaultImages";
import { extractImgSrcs, resolvePasteSourceUrl } from "./pasteSource";
import { openVaultImageSuggest } from "./vaultImageSuggest";

// Brings images into the board — drag-and-drop, paste, the file/vault pickers —
// driving the view through registerDomEvent / contentEl / getItems. Dedup and
// persistence belong to commitImportedItems.
export class AreaImportController {
	private dragDepth = 0;

	constructor(
		private view: AreaGalleryView,
		private plugin: AreaPlugin,
	) {}

	// Wire drag/drop + paste listeners onto the view; registerDomEvent means
	// Obsidian removes them on view unload.
	register(): void {
		this.registerDragAndDrop();
		this.registerPaste();
	}

	openExternalImagePicker(): void {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		input.multiple = true;
		input.style.display = "none";
		document.body.appendChild(input);

		const cleanup = () => {
			if (document.body.contains(input)) {
				document.body.removeChild(input);
			}
		};

		this.view.registerDomEvent(input, "change", async () => {
			const files = Array.from(input.files ?? []);
			cleanup();
			if (files.length > 0) {
				await this.importFiles(files);
			}
		});

		this.view.registerDomEvent(
			window,
			"focus",
			() => {
				window.setTimeout(cleanup, 300);
			},
			{ once: true },
		);

		input.click();
	}

	openVaultImagePicker(): void {
		openVaultImageSuggest(this.plugin.app, (file) => {
			void this.importVaultFiles([file]);
		});
	}

	async importFiles(
		files: File[],
		options?: { sourceUrl?: string },
	): Promise<void> {
		if (this.importsBlocked()) return;
		// Captured before any await: a long import must land in the area the
		// user dropped onto, not whatever file the leaf shows when it finishes.
		const areaPath = this.view.file?.path;
		if (!areaPath) return;

		const progress = createImportProgress(files.length);
		try {
			const result = await importImageFiles(
				this.plugin.app,
				this.plugin.settings.attachmentsDir,
				files,
				this.view.getItems(),
				{ onProgress: progress.onProgress, sourceUrl: options?.sourceUrl },
			);
			showImportImageResultNotice(
				await commitImportedItems(this.plugin.app, areaPath, result),
			);
		} finally {
			progress.dispose();
		}
	}

	async importVaultFiles(files: TFile[]): Promise<void> {
		if (this.importsBlocked()) return;
		const areaPath = this.view.file?.path;
		if (!areaPath) return;

		const progress = createImportProgress(files.length);
		try {
			const result = await importVaultImageFiles(
				this.plugin.app,
				this.plugin.settings.attachmentsDir,
				files,
				this.view.getItems(),
				{ onProgress: progress.onProgress },
			);
			showImportImageResultNotice(
				await commitImportedItems(this.plugin.app, areaPath, result),
			);
		} finally {
			progress.dispose();
		}
	}

	// Refuse imports into a file the view couldn't parse — otherwise the image
	// binary lands in the vault but the item can never be saved (getViewData
	// round-trips the original bytes).
	private importsBlocked(): boolean {
		if (this.view.canModify()) return false;
		new Notice("Area: fix this file before adding images.");
		return true;
	}

	private registerDragAndDrop(): void {
		const { contentEl } = this.view;

		this.view.registerDomEvent(contentEl, "dragenter", (e: DragEvent) => {
			if (!hasFileTransfer(e)) return;
			e.preventDefault();
			this.dragDepth++;
			contentEl.addClass("area-is-dragging");
		});

		this.view.registerDomEvent(contentEl, "dragover", (e: DragEvent) => {
			if (!hasFileTransfer(e)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
		});

		this.view.registerDomEvent(contentEl, "dragleave", (e: DragEvent) => {
			if (!hasFileTransfer(e)) return;
			this.dragDepth = Math.max(0, this.dragDepth - 1);
			if (this.dragDepth === 0) {
				contentEl.removeClass("area-is-dragging");
			}
		});

		this.view.registerDomEvent(contentEl, "drop", async (e: DragEvent) => {
			if (!hasFileTransfer(e)) return;
			e.preventDefault();
			this.clearDragState();

			const files = Array.from(e.dataTransfer?.files ?? []);
			if (files.length === 0) return;
			await this.importFiles(files);
		});
	}

	private registerPaste(): void {
		this.view.registerDomEvent(document, "paste", async (e: ClipboardEvent) => {
			if (!this.shouldHandlePaste(e)) return;

			const files = getClipboardImageFiles(e);
			if (files.length === 0) {
				new Notice("Area: clipboard has no images.");
				return;
			}

			// The DataTransfer dies when the handler returns: everything it
			// holds must be read before the first await.
			const html = e.clipboardData?.getData("text/html") ?? "";
			e.preventDefault();

			const sourceUrl = html
				? resolvePasteSourceUrl(extractImgSrcs(html), files.length)
				: undefined;
			await this.importFiles(files, { sourceUrl });
		});
	}

	private shouldHandlePaste(event: ClipboardEvent): boolean {
		if (!this.view.isActiveView()) return false;
		if (isEditableTarget(event.target)) return false;
		if (isEditableTarget(document.activeElement)) return false;

		return true;
	}

	private clearDragState(): void {
		this.dragDepth = 0;
		this.view.contentEl.removeClass("area-is-dragging");
	}
}

function hasFileTransfer(event: DragEvent): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.closest("input, textarea, [contenteditable='true']") !== null;
}
