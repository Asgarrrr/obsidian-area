import type { App } from "obsidian";
import type { AreaItem } from "../../types";
import { renderAreaTagToken } from "../TagInput";
import { openItemDetailView } from "../item-detail/openItemDetail";
import { getFileName } from "../item-detail/attachments";
import { getValidSourceUrl } from "../item-detail/sourceActions";

// A board is meant to be looked at. Past a few tags the overlay stops annotating
// the image and starts hiding it, so the rest is left to the detail panel.
const MAX_OVERLAY_TAGS = 3;

interface RenderAreaCardOptions {
	app: App;
	grid: HTMLElement;
	item: AreaItem;
	// The .area file path + the full visible list + this card's position, so the
	// detail view can resolve the live gallery and page through the selection.
	areaPath: string;
	siblings: AreaItem[];
	index: number;
	showTitle: boolean;
}

export function renderAreaCard({
	app,
	grid,
	item,
	areaPath,
	siblings,
	index,
	showTitle,
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
	img.draggable = false;
	// Cards render the downscaled copy when the import produced one; a thumbnail
	// deleted behind our back falls back to the original rather than a broken
	// tile. `onerror` is cleared first so the fallback can't loop on itself.
	if (item.thumbPath) {
		img.onerror = () => {
			img.onerror = null;
			img.src = app.vault.adapter.getResourcePath(item.vaultPath);
		};
	}
	img.src = app.vault.adapter.getResourcePath(item.thumbPath ?? item.vaultPath);

	// Reject anything that isn't http(s) — a .area file is shareable JSON, so a
	// raw item.sourceUrl could be a `javascript:` URL that runs on click.
	const sourceUrl = getValidSourceUrl(item);

	// Only build the hover overlay when it has something to show — otherwise it
	// just darkens the image on hover for no reason.
	if (item.tags.length > 0 || sourceUrl) {
		const overlay = media.createDiv("area-card-overlay");
		const tagRow = overlay.createDiv("area-card-tags");
		for (const tag of item.tags.slice(0, MAX_OVERLAY_TAGS)) {
			renderAreaTagToken(tagRow, tag);
		}

		const hiddenTags = item.tags.length - MAX_OVERLAY_TAGS;
		if (hiddenTags > 0) {
			const more = tagRow.createSpan({
				cls: "area-card-tags-more",
				text: `+${hiddenTags}`,
			});
			more.setAttribute("title", item.tags.slice(MAX_OVERLAY_TAGS).join(", "));
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
	if (showTitle && displayTitle) {
		card.createDiv({ cls: "area-card-title", text: displayTitle });
	}

	// The card is the primary control of this view, so it has to answer to the
	// keyboard as well as the mouse — without this the :focus-within overlay rule
	// could never fire either.
	card.tabIndex = 0;
	card.setAttribute("role", "button");
	card.setAttribute(
		"aria-label",
		displayTitle ?? getFileName(item.vaultPath) ?? "Area item",
	);

	const open = () => {
		void openItemDetailView(app, {
			areaPath,
			siblingIds: siblings.map((sibling) => sibling.id),
			index,
		});
	};

	card.addEventListener("click", open);
	card.addEventListener("keydown", (evt) => {
		if (evt.key !== "Enter" && evt.key !== " ") return;
		// Space would otherwise scroll the grid out from under the card.
		evt.preventDefault();
		open();
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
