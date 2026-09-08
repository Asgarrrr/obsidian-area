import { ButtonComponent } from "obsidian";

// The bar that appears under the toolbar once something is selected. It is
// rendered once per full view render and then only updated, so toggling a card
// never rebuilds DOM the user is pointing at.

interface BulkBarOptions {
	container: HTMLElement;
	onClear: () => void;
	onEdit: () => void;
	onRemove: () => void;
}

export interface BulkBarHandle {
	/** `hidden` counts selected items the current filters keep off screen. */
	update(selected: number, hidden: number): void;
}

export function renderBulkBar({
	container,
	onClear,
	onEdit,
	onRemove,
}: BulkBarOptions): BulkBarHandle {
	container.empty();
	container.addClass("area-bulk-bar");
	container.setAttribute("role", "toolbar");
	container.setAttribute("aria-label", "Selection actions");

	const countEl = container.createDiv("area-bulk-count");
	const hiddenEl = container.createDiv("area-bulk-hidden");

	// Plain Obsidian buttons, unstyled by this plugin: the destructive one gets
	// the app's own warning treatment through setWarning().
	const actions = container.createDiv("area-bulk-actions");
	new ButtonComponent(actions)
		.setButtonText("Clear selection")
		.onClick(onClear);
	new ButtonComponent(actions)
		.setButtonText("Edit selection")
		.setCta()
		.onClick(onEdit);
	new ButtonComponent(actions)
		.setButtonText("Remove from area")
		.setWarning()
		.onClick(onRemove);

	const update = (selected: number, hidden: number): void => {
		container.toggleClass("area-bulk-bar--hidden", selected === 0);
		// Nothing below reads correctly at zero, and the bar is hidden anyway.
		if (selected === 0) return;

		countEl.setText(`${selected} selected`);
		hiddenEl.setText(hidden > 0 ? `${hidden} hidden by filters` : "");
		hiddenEl.toggleClass("area-bulk-hidden--empty", hidden === 0);
	};

	update(0, 0);
	return { update };
}
