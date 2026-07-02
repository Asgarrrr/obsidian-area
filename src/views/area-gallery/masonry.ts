// Row-major masonry via CSS grid spans.
//
// The grid uses 1px auto-rows and no row-gap; each card spans
// ceil(contentHeight) + GUTTER rows, so its empty tail row *is* the vertical
// gutter. Because CSS grid fills row by row, cards read left-to-right (so
// "Newest first" actually reads across the top row) while keeping variable
// heights.
//
// MasonryController owns the lifecycle: it re-binds to each freshly rendered
// grid, relays out on image load and grid resize, and tears every listener
// down on the next bind or on view unload.

export const MASONRY_GUTTER = 8;

export class MasonryController {
	private grid: HTMLElement | null = null;
	private observer: ResizeObserver | null = null;
	private raf: number | null = null;
	private imgListeners: AbortController | null = null;
	// Column width of the last completed layout. The observer relayouts only when
	// the width actually changed, so its redundant initial fire (and height-only
	// changes) are skipped without swallowing a real width change that coalesced
	// into that first callback.
	private lastWidth = 0;

	// Bind to a newly rendered grid. Late-loading images correct their span
	// once real dimensions are known; the ResizeObserver recomputes on width
	// changes (pane resize, scrollbar appearing).
	observe(grid: HTMLElement): void {
		this.disconnect();
		this.grid = grid;

		// One AbortController per bind tears every image listener down on the
		// next observe()/destroy(), so nothing lingers on detached cards.
		this.imgListeners = new AbortController();
		const { signal } = this.imgListeners;
		for (const card of cards(grid)) {
			const img = card.querySelector<HTMLImageElement>("img");
			if (img && !img.complete) {
				const relayout = () => this.scheduleLayout();
				img.addEventListener("load", relayout, { once: true, signal });
				img.addEventListener("error", relayout, { once: true, signal });
			}
		}

		// Lay out synchronously so cards never flash at 1px before the
		// observer's first (async) callback. Record the width laid out at (0 when
		// the grid is hidden) so the observer can tell a redundant fire from a
		// real width change.
		this.lastWidth = layoutGrid(grid);

		this.observer = new ResizeObserver(() => {
			// Relayout only when the column width actually changed; skip the
			// observer's redundant initial fire and height-only changes (image
			// loads already trigger their own relayout).
			const width = currentWidth(grid);
			if (width !== 0 && width === this.lastWidth) return;
			this.scheduleLayout();
		});
		this.observer.observe(grid);
	}

	// Recompute every span now. Used after a card-size setting change, which
	// alters column width without resizing the grid, so the observer won't fire.
	relayout(): void {
		if (this.grid) this.lastWidth = layoutGrid(this.grid);
	}

	// Stop watching (e.g. an empty render replaces the grid element). Keeps the
	// grid reference so a later relayout() is a harmless no-op.
	disconnect(): void {
		this.imgListeners?.abort();
		this.imgListeners = null;
		this.observer?.disconnect();
		this.observer = null;
		if (this.raf !== null) {
			cancelAnimationFrame(this.raf);
			this.raf = null;
		}
		this.lastWidth = 0;
	}

	destroy(): void {
		this.disconnect();
		this.grid = null;
	}

	// Coalesce bursts (many image loads, scrollbar-driven resize) into one
	// layout on the next frame; the rAF also breaks the
	// resize → scrollbar → resize feedback loop.
	private scheduleLayout(): void {
		if (this.raf !== null) cancelAnimationFrame(this.raf);
		this.raf = requestAnimationFrame(() => {
			this.raf = null;
			if (this.grid) this.lastWidth = layoutGrid(this.grid);
		});
	}
}

function cards(grid: HTMLElement): HTMLElement[] {
	return Array.from(grid.querySelectorAll<HTMLElement>(".area-card"));
}

// Current column width (all columns are equal), or 0 when the grid isn't laid
// out yet. Used by the observer to detect real width changes.
function currentWidth(grid: HTMLElement): number {
	const first = cards(grid)[0];
	return first ? first.offsetWidth : 0;
}

// Two-pass to avoid layout thrashing: read the shared column width and every
// card's measurements first, then write all spans. No layout read follows a
// write, so the loop forces at most one reflow instead of one per card.
// Returns the column width laid out at, or 0 when the grid isn't laid out yet
// (0 width) so callers can defer and track the last width.
function layoutGrid(grid: HTMLElement): number {
	const list = cards(grid);
	const first = list[0];
	if (!first) return 0;

	// All columns are equal width (auto-fill + 1fr), so read it once.
	const width = first.offsetWidth;
	if (width === 0) return 0;

	// Pass 1 — reads only.
	const layouts = list.map((card) => ({
		card,
		span: computeSpan(card, width),
	}));
	// Pass 2 — writes only.
	for (const { card, span } of layouts) {
		card.style.gridRowEnd = `span ${span}`;
	}
	return width;
}

function computeSpan(card: HTMLElement, width: number): number {
	const img = card.querySelector<HTMLImageElement>("img");
	const title = card.querySelector<HTMLElement>(".area-card-title");
	const titleHeight = title ? title.offsetHeight : 0;

	return (
		Math.ceil(mediaHeight(card, img, width) + titleHeight) + MASONRY_GUTTER
	);
}

function mediaHeight(
	card: HTMLElement,
	img: HTMLImageElement | null,
	width: number,
): number {
	// Once the image has loaded, its rendered height (height:auto at the column
	// width) is ground truth — correct for normal images, dimensionless SVGs,
	// and broken/errored images alike.
	if (img && img.complete) return img.offsetHeight || width;

	// Not loaded yet: use the import-time aspect ratio when we have it so the
	// span is already correct (no reflow when the image loads); otherwise a
	// square estimate, corrected by the load listener.
	const ar = Number(card.dataset.ar);
	return ar > 0 ? width / ar : width;
}
