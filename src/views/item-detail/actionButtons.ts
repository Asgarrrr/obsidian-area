import { ButtonComponent, type App } from "obsidian";
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

export interface SourceActionButtons {
	openSourceButton: ButtonComponent;
	copySourceButton: ButtonComponent;
}

export function renderAttachmentActions(
	container: HTMLElement,
	app: App,
	item: AreaItem,
	onClose: () => void,
): void {
	const file = getAttachmentFile(app, item);
	const tooltip = (active: string) => (file ? active : "Attachment not found");

	addFileActionButton(container, {
		icon: "image",
		text: "Open",
		label: "Open attachment",
		tooltip: tooltip("Open attachment"),
		disabled: !file,
		onClick: async () => {
			if (await openAttachment(app, item)) onClose();
		},
	});

	addFileActionButton(container, {
		icon: "folder-open",
		text: "Reveal",
		label: "Reveal in Files",
		tooltip: tooltip("Reveal in Files"),
		disabled: !file,
		onClick: () => {
			if (revealAttachment(app, item)) onClose();
		},
	});

	if (canShowAttachmentInSystemFolder(app)) {
		addFileActionButton(container, {
			icon: "folder-search",
			text: "Folder",
			label: "Show in system folder",
			tooltip: tooltip("Show in system folder"),
			disabled: !file,
			onClick: () => {
				if (showAttachmentInSystemFolder(app, item)) onClose();
			},
		});
	}
}

interface FileActionButton {
	icon: string;
	text: string;
	label: string;
	tooltip: string;
	disabled: boolean;
	onClick: () => void | Promise<void>;
}

function addFileActionButton(
	container: HTMLElement,
	{ icon, text, label, tooltip, disabled, onClick }: FileActionButton,
): void {
	const button = new ButtonComponent(container)
		.setIcon(icon)
		.setButtonText(text)
		.setClass("area-detail-file-action-button")
		.setTooltip(tooltip)
		.setDisabled(disabled)
		.onClick((evt) => {
			stopEvent(evt);
			void onClick();
		});
	button.buttonEl.setAttribute("aria-label", label);
}

export function renderSourceActions(
	container: HTMLElement,
	item: AreaItem,
): SourceActionButtons {
	const openSourceButton = new ButtonComponent(container)
		.setIcon("external-link")
		.setButtonText("Open source")
		.onClick((evt) => {
			stopEvent(evt);
			openSourceUrl(item);
		});

	const copySourceButton = new ButtonComponent(container)
		.setIcon("copy")
		.setButtonText("Copy URL")
		.onClick((evt) => {
			stopEvent(evt);
			copySourceUrl(item);
		});

	const buttons = { openSourceButton, copySourceButton };
	syncSourceActionState(item, buttons);
	return buttons;
}

export function syncSourceActionState(
	item: AreaItem,
	{ openSourceButton, copySourceButton }: SourceActionButtons,
): void {
	const hasSource = Boolean(getSourceUrl(item));
	const hasValidSource = Boolean(getValidSourceUrl(item));

	openSourceButton.setTooltip(
		hasValidSource ? "Open source" : "Add a valid source URL first",
	);
	copySourceButton.setTooltip(
		hasSource ? "Copy source URL" : "Add a source URL first",
	);
}
