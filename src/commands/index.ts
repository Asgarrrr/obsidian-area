import { App, ButtonComponent, Modal, Notice, TextComponent } from "obsidian";
import type AreaPlugin from "../main";
import { AreaGalleryView } from "../views/AreaGalleryView";
import { FileSuggestModal } from "../views/fileSuggest";
import { createThumbnail } from "../views/area-gallery/thumbnails";
import { registerAddToArea } from "./addToArea";

function getActiveAreaView(app: App): AreaGalleryView | null {
	return app.workspace.getActiveViewOfType(AreaGalleryView);
}

async function newAreaCommand(plugin: AreaPlugin): Promise<void> {
	new NewAreaModal(plugin.app, async (name: string) => {
		const slug = name
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");

		const activeFile = plugin.app.workspace.getActiveFile();
		const parent = plugin.app.fileManager.getNewFileParent(
			activeFile?.path ?? "",
		);

		let path = `${parent.path === "/" ? "" : parent.path + "/"}${slug}.area`;
		let n = 2;
		while (await plugin.app.vault.adapter.exists(path)) {
			path = path.replace(/(-\d+)?\.area$/, `-${n}.area`);
			n++;
		}

		const content = JSON.stringify({ version: "1", name, items: [] }, null, 2);
		const file = await plugin.app.vault.create(path, content);
		await plugin.app.workspace.getLeaf(false).openFile(file);
	}).open();
}

class NewAreaModal extends Modal {
	private name = "";

	constructor(
		app: App,
		private onSubmit: (name: string) => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "New area" });

		const input = new TextComponent(contentEl)
			.setPlaceholder("Area name…")
			.onChange((value) => {
				this.name = value;
			});
		input.inputEl.addClass("area-new-name-input");
		input.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && this.name.trim()) this.submit();
		});

		new ButtonComponent(contentEl)
			.setButtonText("Create")
			.setCta()
			.onClick(() => {
				if (this.name.trim()) this.submit();
			});

		window.setTimeout(() => input.inputEl.focus(), 50);
	}

	private submit() {
		this.close();
		this.onSubmit(this.name.trim());
	}

	onClose() {
		this.contentEl.empty();
	}
}

// Backfill for items imported before thumbnails existed, and for any whose
// generation failed at import time. Skips items that already have one.
async function generateMissingThumbnails(
	plugin: AreaPlugin,
	view: AreaGalleryView,
): Promise<void> {
	const pending = view.getItems().filter((item) => !item.thumbPath);
	if (pending.length === 0) {
		new Notice("Area: all thumbnails are up to date.");
		return;
	}

	const progress = new Notice(
		`Area: generating ${pending.length} thumbnails…`,
		0,
	);
	let created = 0;
	for (const item of pending) {
		const thumbPath = await createThumbnail(
			plugin.app,
			item,
			plugin.settings.attachmentsDir,
		);
		if (thumbPath) {
			item.thumbPath = thumbPath;
			created++;
		}
	}
	progress.hide();

	if (created > 0) {
		view.requestSave();
		view.rerenderGrid();
	}
	// Images already under the thumbnail size are skipped, so created can be
	// lower than pending without anything having failed.
	new Notice(`Area: ${created} of ${pending.length} thumbnails generated.`);
}

function openAreaCommand(plugin: AreaPlugin): void {
	const areas = plugin.app.vault
		.getFiles()
		.filter((f) => f.extension === "area");
	if (areas.length === 0) {
		new Notice("No areas found. Use 'New area' to create one.");
		return;
	}
	new FileSuggestModal(
		plugin.app,
		areas,
		(file) => plugin.app.workspace.getLeaf(false).openFile(file),
		"Choose an area…",
	).open();
}

export function registerCommands(plugin: AreaPlugin): void {
	plugin.addCommand({
		id: "area:new",
		name: "New area",
		callback: () => {
			newAreaCommand(plugin);
		},
	});

	plugin.addCommand({
		id: "area:add-image",
		name: "Add image to area",
		checkCallback: (checking) => {
			const view = getActiveAreaView(plugin.app);
			if (!view) return false;
			if (!checking) view.openExternalImagePicker();
			return true;
		},
	});

	plugin.addCommand({
		id: "area:add-existing-vault-image",
		name: "Add existing vault image to area",
		checkCallback: (checking) => {
			const view = getActiveAreaView(plugin.app);
			if (!view) return false;
			if (!checking) view.openVaultImagePicker();
			return true;
		},
	});

	plugin.addCommand({
		id: "area:generate-thumbnails",
		name: "Generate missing thumbnails",
		checkCallback: (checking) => {
			const view = getActiveAreaView(plugin.app);
			if (!view?.canModify()) return false;
			if (!checking) void generateMissingThumbnails(plugin, view);
			return true;
		},
	});

	plugin.addCommand({
		id: "area:open",
		name: "Open area",
		callback: () => {
			openAreaCommand(plugin);
		},
	});

	registerAddToArea(plugin);
}

export { openAreaCommand };
