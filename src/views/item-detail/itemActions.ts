import { ButtonComponent, Menu, type App } from "obsidian";
import { stopEvent } from "../../dom";
import type { AreaItem } from "../../types";
import {
	canShowAttachmentInSystemFolder,
	getAttachmentFile,
	openAttachment,
	revealAttachment,
	showAttachmentInSystemFolder,
} from "./attachments";
import {
	copySourceUrl,
	getSourceUrl,
	getValidSourceUrl,
	openSourceUrl,
} from "./sourceActions";

// The sidebar footer used to line up five same-weight text buttons that wrapped
// onto two rows, most of them permanently greyed. It now shows the one action
// that makes sense for this item and files the rest under an overflow menu.

interface ItemAction {
	icon: string;
	label: string;
	// Present = the action can't run, and this says why. Shown instead of the
	// generic tooltip so a dead button stops being a mystery.
	disabledReason?: string;
	run: () => void | Promise<void>;
}

export function renderItemActions(
	container: HTMLElement,
	app: App,
	item: AreaItem,
): void {
	container.empty();

	const actions = buildItemActions(app, item);
	const primaryIndex = actions.findIndex((action) => !action.disabledReason);
	// Everything disabled: lead with the first action anyway so the footer keeps
	// its shape and the button carries the reason.
	const primary = actions[primaryIndex === -1 ? 0 : primaryIndex];
	if (!primary) return;

	renderPrimary(container, primary);

	const overflow = actions.filter((action) => action !== primary);
	if (overflow.length > 0) renderOverflow(container, overflow);
}

function buildItemActions(app: App, item: AreaItem): ItemAction[] {
	// Obsidian skips folders whose name starts with a dot, so an attachment saved
	// under the default `.attachments/…` has no TFile and the vault-level actions
	// genuinely cannot run. Distinguish that from a missing file.
	const hasFile = Boolean(getAttachmentFile(app, item));
	const fileReason = hasFile
		? undefined
		: isHiddenVaultPath(item.vaultPath)
			? "Hidden folder"
			: "File not found";

	const actions: ItemAction[] = [];

	if (getSourceUrl(item)) {
		actions.push({
			icon: "external-link",
			label: "Open source",
			disabledReason: getValidSourceUrl(item) ? undefined : "Invalid URL",
			run: () => openSourceUrl(item),
		});
		actions.push({
			icon: "copy",
			label: "Copy source URL",
			run: () => copySourceUrl(item),
		});
	}

	if (canShowAttachmentInSystemFolder(app)) {
		// Path-based, so unlike the two below it works for hidden folders too.
		actions.push({
			icon: "folder-search",
			label: "Show in system folder",
			run: () => showAttachmentInSystemFolder(app, item),
		});
	}

	actions.push({
		icon: "image",
		label: "Open in a new tab",
		disabledReason: fileReason,
		run: () => {
			void openAttachment(app, item);
		},
	});

	actions.push({
		icon: "folder-open",
		label: "Reveal in Files",
		disabledReason: fileReason,
		run: () => {
			revealAttachment(app, item);
		},
	});

	if (!getSourceUrl(item)) {
		actions.push({
			icon: "external-link",
			label: "Open source",
			disabledReason: "No source URL",
			run: () => openSourceUrl(item),
		});
	}

	return actions;
}

function renderPrimary(container: HTMLElement, action: ItemAction): void {
	const button = new ButtonComponent(container)
		.setIcon(action.icon)
		.setButtonText(action.label)
		.setTooltip(action.disabledReason ?? action.label)
		.setDisabled(Boolean(action.disabledReason))
		.onClick((evt) => {
			stopEvent(evt);
			void action.run();
		});
	button.buttonEl.addClass("area-detail-primary-action");
	button.buttonEl.setAttribute("aria-label", action.label);
}

function renderOverflow(container: HTMLElement, actions: ItemAction[]): void {
	const button = new ButtonComponent(container)
		.setIcon("more-horizontal")
		.setTooltip("More actions")
		.onClick((evt) => {
			stopEvent(evt);
			const menu = new Menu();
			for (const action of actions) {
				menu.addItem((menuItem) => {
					menuItem
						.setIcon(action.icon)
						// Menu items carry no tooltip, so a blocked action states its
						// reason inline rather than sitting there greyed and unexplained.
						.setTitle(
							action.disabledReason
								? `${action.label} (${action.disabledReason})`
								: action.label,
						)
						.setDisabled(Boolean(action.disabledReason))
						.onClick(() => void action.run());
				});
			}
			menu.showAtMouseEvent(evt);
		});
	button.buttonEl.addClass("area-detail-overflow-action");
	button.buttonEl.setAttribute("aria-label", "More actions");
}

function isHiddenVaultPath(vaultPath: string): boolean {
	return vaultPath.split("/").some((segment) => segment.startsWith("."));
}
