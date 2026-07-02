import type { App } from "obsidian";
import type { AreaItem } from "../../types";
import { renderAreaTagToken } from "../TagInput";
import { openItemDetailView } from "../item-detail/openItemDetail";
import { getFileName } from "../item-detail/attachments";
import { getValidSourceUrl } from "../item-detail/sourceActions";

interface RenderAreaCardOptions {
	app: App;
	grid: HTMLElement;
	item: AreaItem;
	// The .area file path + the full visible list + this card's position, so the
	// detail view can resolve the live gallery and page through the selection.
	areaPath: string;
	siblings: AreaItem[];
	index: number;
}

export function renderAreaCard({
	app,
	grid,
	item,
	areaPath,
	siblings,
	index,
}: RenderAreaCardOptions): void {
	const card = grid.createDiv("area-card");

	// Import-time aspect ratio (if known) lets masonry size the card before the
	// image loads — read back in masonry.ts computeSpan().
	if (item.aspectRatio && item.aspectRatio > 0) {
		card.dataset.ar = String(item.aspectRatio);
	}

	// Rounded media container clips the image and the hover overlay, so the
	// title can sit below it on the transparent card.
	const media = card.createDiv("area-card-media");
	const img = media.createEl("img");
	img.loading = "lazy";
	img.src = app.vault.adapter.getResourcePath(item.vaultPath);

	// Reject anything that isn't http(s) — a .area file is shareable JSON, so a
	// raw item.sourceUrl could be a `javascript:` URL that runs on click.
	const sourceUrl = getValidSourceUrl(item);

	// Only build the hover overlay when it has something to show — otherwise it
	// just darkens the image on hover for no reason.
	if (item.tags.length > 0 || sourceUrl) {
		const overlay = media.createDiv("area-card-overlay");
		const tagRow = overlay.createDiv("area-card-tags");
		for (const tag of item.tags) {
			renderAreaTagToken(tagRow, tag);
		}
		if (sourceUrl) {
			const link = overlay.createEl("a", { cls: "area-card-source" });
			link.href = sourceUrl;
			link.target = "_blank";
			link.rel = "noopener";
			link.setAttribute("aria-label", "Open source");
			// The link opens the URL itself; stop the click bubbling to the card
			// handler so the detail modal doesn't also open.
			link.addEventListener("click", (evt) => evt.stopPropagation());
		}
	}

	const displayTitle = getDisplayTitle(item);
	if (displayTitle) {
		card.createDiv({ cls: "area-card-title", text: displayTitle });
	}

	card.addEventListener("click", () => {
		void openItemDetailView(app, {
			areaPath,
			siblingIds: siblings.map((sibling) => sibling.id),
			index,
		});
	});
}

// Only surface a caption when the title carries real meaning — skip the generic
// "image"/"video" default and filename-derived titles so the board stays visual.
function getDisplayTitle(item: AreaItem): string | null {
	const title = item.title?.trim();
	if (!title) return null;

	const lower = title.toLowerCase();
	if (lower === item.type) return null;

	const fileName = getFileName(item.vaultPath);
	const baseName = fileName.replace(/\.[^.]+$/, "");
	if (lower === fileName.toLowerCase() || lower === baseName.toLowerCase()) {
		return null;
	}

	return title;
}
