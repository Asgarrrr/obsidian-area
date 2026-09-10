import { ButtonComponent, DropdownComponent, Menu } from "obsidian";
import type { AreaSavedView } from "../../types";

// The saved-view picker: a select for switching, and a menu for the actions
// that write to disk. Obsidian's Menu fits here — every entry is a one-shot
// command, unlike the facet popover which has to survive repeated clicks.

// Empty string is the select's "no saved view" slot: a <select> option value
// cannot be null, and this keeps the unfiltered state reachable.
const UNSAVED_VALUE = "";

export interface SavedViewsBarOptions {
	container: HTMLElement;
	views: AreaSavedView[];
	activeViewId: string | null;
	// False while the file couldn't be parsed — every write is refused, so the
	// actions that persist must not be offered.
	canModify: boolean;
	// Whether the controller still holds a view to act on. Read at click time,
	// not at render: the displayed selection drops to "All items" as soon as the
	// filters drift, but the view is still there to update, rename or delete.
	hasManagedView: () => boolean;
	onSelect: (id: string | null) => void;
	onSaveAsNew: () => void;
	onUpdateActive: () => void;
	onRenameActive: () => void;
	onDeleteActive: () => void;
}

export interface SavedViewsBarHandle {
	// Repaints the selection after a filter change, without rebuilding the
	// toolbar — a re-render would tear down an open facet menu mid-click.
	setActiveView: (id: string | null) => void;
}

export function renderSavedViewsBar({
	container,
	views,
	activeViewId,
	canModify,
	hasManagedView,
	onSelect,
	onSaveAsNew,
	onUpdateActive,
	onRenameActive,
	onDeleteActive,
}: SavedViewsBarOptions): SavedViewsBarHandle {
	const bar = container.createDiv("area-saved-views");

	const select = new DropdownComponent(bar);
	select.selectEl.addClass("area-saved-view-select");
	select.selectEl.setAttribute("aria-label", "Saved view");
	select.addOption(UNSAVED_VALUE, views.length > 0 ? "All items" : "No view");
	for (const view of views) select.addOption(view.id, view.label);

	// A saved view can vanish from under the selection — a second window
	// deleting it, or a hand-edited file. Fall back rather than show a blank.
	const active =
		activeViewId && views.some((view) => view.id === activeViewId)
			? activeViewId
			: UNSAVED_VALUE;
	select
		.setValue(active)
		.onChange((value) => onSelect(value === UNSAVED_VALUE ? null : value));

	const actions = new ButtonComponent(bar)
		.setIcon("bookmark")
		.setTooltip("Saved views")
		.onClick((evt) => {
			const hasActive = hasManagedView();
			const menu = new Menu();
			menu.addItem((entry) =>
				entry
					.setTitle("Save current filters as a view…")
					.setIcon("bookmark-plus")
					.setDisabled(!canModify)
					.onClick(onSaveAsNew),
			);
			menu.addItem((entry) =>
				entry
					.setTitle("Update this view")
					.setIcon("save")
					.setDisabled(!canModify || !hasActive)
					.onClick(onUpdateActive),
			);
			menu.addSeparator();
			menu.addItem((entry) =>
				entry
					.setTitle("Rename this view…")
					.setIcon("pencil")
					.setDisabled(!canModify || !hasActive)
					.onClick(onRenameActive),
			);
			menu.addItem((entry) =>
				entry
					.setTitle("Delete this view")
					.setIcon("trash-2")
					.setDisabled(!canModify || !hasActive)
					.onClick(onDeleteActive),
			);
			menu.showAtMouseEvent(evt);
		});
	actions.buttonEl.addClass("area-saved-view-actions");
	actions.buttonEl.setAttribute("aria-label", "Saved views");

	return {
		setActiveView: (id) => {
			const next = id ?? UNSAVED_VALUE;
			if (select.selectEl.value !== next) select.selectEl.value = next;
		},
	};
}
