import { ButtonComponent } from "obsidian";
import type { Facet } from "./facets";
import { closeFacetMenu, isFacetMenuOpenFor, openFacetMenu } from "./facetMenu";

// The row of filter buttons under the search box. Tag facets and custom-field
// facets share it: each binding brings its own active-set predicate, so the bar
// stays ignorant of where a selection is stored.

export interface FacetBinding {
	facet: Facet;
	isActive: (value: string) => boolean;
	onToggle: (value: string) => void;
	// Marks the button as a schema field rather than a tag namespace.
	kind?: "tag" | "field";
}

interface FacetBarOptions {
	bindings: FacetBinding[];
	hasActiveFilters: () => boolean;
	onClearAll: () => void;
}

export function renderFacetBar(
	container: HTMLElement,
	{ bindings, hasActiveFilters, onClearAll }: FacetBarOptions,
): void {
	const bar = container.createDiv("area-facets");
	const syncCallbacks: Array<() => void> = [];

	function syncClearVisibility(): void {
		clearButton.buttonEl.toggleClass(
			"area-facet-clear--hidden",
			!hasActiveFilters(),
		);
	}

	for (const binding of bindings) {
		syncCallbacks.push(
			renderFacetButton(bar, binding, () => syncClearVisibility()),
		);
	}

	const clearButton = new ButtonComponent(bar)
		.setButtonText("Clear")
		.setTooltip("Clear all filters")
		.onClick(() => {
			onClearAll();
			for (const sync of syncCallbacks) sync();
			syncClearVisibility();
		});
	clearButton.buttonEl.addClass("area-facet-clear");

	syncClearVisibility();
}

// Returns a callback that re-reads the active set and repaints the badge, so an
// external clear can refresh the button without rebuilding the toolbar.
function renderFacetButton(
	bar: HTMLElement,
	{ facet, isActive, onToggle, kind = "tag" }: FacetBinding,
	afterToggle: () => void,
): () => void {
	const subject = kind === "field" ? facet.label : facet.label.toLowerCase();
	const button = new ButtonComponent(bar)
		.setButtonText(facet.label)
		.setTooltip(`Filter by ${subject}`);
	const buttonEl = button.buttonEl;
	buttonEl.addClass("area-facet-button");
	if (kind === "field") buttonEl.addClass("area-facet-button--field");
	buttonEl.setAttribute("aria-haspopup", "true");
	buttonEl.setAttribute("aria-expanded", "false");

	const badge = buttonEl.createSpan("area-facet-badge");

	const sync = (): void => {
		const active = facet.values.filter((value) => isActive(value.tag)).length;
		buttonEl.classList.toggle("is-active", active > 0);
		badge.setText(active > 0 ? String(active) : "");
		badge.toggleClass("area-facet-badge--hidden", active === 0);
	};

	button.onClick(() => {
		// Second click on the open menu's own button dismisses it; the outside
		// handler deliberately ignores the anchor so this stays a toggle.
		if (isFacetMenuOpenFor(buttonEl)) {
			closeFacetMenu();
			buttonEl.setAttribute("aria-expanded", "false");
			return;
		}

		openFacetMenu({
			anchor: buttonEl,
			facet,
			isActive,
			onToggle: (value) => {
				onToggle(value);
				sync();
				afterToggle();
			},
		});
		buttonEl.setAttribute("aria-expanded", "true");
	});

	sync();
	return sync;
}
