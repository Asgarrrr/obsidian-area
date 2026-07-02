import { setIcon } from "obsidian";

export type EmptyStateKind = "empty" | "no-results" | "unreadable";

export interface RenderEmptyStateOptions {
	container: HTMLElement;
	kind: EmptyStateKind;
	onClearFilters?: () => void;
}

const COPY: Record<
	EmptyStateKind,
	{ icon: string; title: string; sub: string }
> = {
	empty: {
		icon: "image",
		title: "No references yet",
		sub: "Drag & drop images, paste from clipboard, or use the import buttons above.",
	},
	"no-results": {
		icon: "search-x",
		title: "No results",
		sub: "No items match the current search or tag filter.",
	},
	unreadable: {
		icon: "alert-triangle",
		title: "Couldn't read this file",
		sub: "This .area file isn't valid or is missing its items list. It won't be modified — fix it in a text editor to recover.",
	},
};

export function renderEmptyState({
	container,
	kind,
	onClearFilters,
}: RenderEmptyStateOptions): void {
	const copy = COPY[kind];
	const el = container.createDiv("area-empty-state");

	setIcon(el.createDiv("area-empty-state__icon"), copy.icon);
	el.createEl("p", { cls: "area-empty-state__title", text: copy.title });
	el.createEl("p", { cls: "area-empty-state__sub", text: copy.sub });

	if (kind === "no-results" && onClearFilters) {
		const btn = el.createEl("button", {
			cls: "area-empty-state__clear",
			text: "Clear filters",
		});
		btn.addEventListener("click", onClearFilters);
	}
}
