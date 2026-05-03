import type { App } from "obsidian";
import type { AreaFile, AreaItem } from "../../types";
import { ItemDetailModal } from "../ItemDetailModal";
import { renderAreaTagToken } from "../TagInput";

interface RenderAreaCardOptions {
	app: App;
	areaData: AreaFile;
	grid: HTMLElement;
	item: AreaItem;
	onDataChanged: () => void;
	onStructuralChange: () => void;
	onTagsChanged: () => void;
}

export function renderAreaCard({
	app,
	areaData,
	grid,
	item,
	onDataChanged,
	onStructuralChange,
	onTagsChanged,
}: RenderAreaCardOptions): void {
	const card = grid.createDiv("area-card");
	const img = card.createEl("img");
	img.loading = "lazy";
	img.src = app.vault.adapter.getResourcePath(item.vaultPath);

	if (item.title) {
		card.createDiv({ cls: "area-card-title", text: item.title });
	}

	const overlay = card.createDiv("area-card-overlay");
	const tagRow = overlay.createDiv("area-card-tags");
	for (const tag of item.tags) {
		renderAreaTagToken(tagRow, tag);
	}
	if (item.sourceUrl) {
		const link = overlay.createEl("a", { cls: "area-card-source" });
		link.href = item.sourceUrl;
		link.target = "_blank";
		link.rel = "noopener";
		link.setAttribute("aria-label", "Open source");
	}

	card.addEventListener("click", () => {
		new ItemDetailModal(
			app,
			item,
			areaData,
			onDataChanged,
			onStructuralChange,
			onTagsChanged,
		).open();
	});
}
