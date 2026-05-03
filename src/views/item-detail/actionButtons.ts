import { ButtonComponent, type App } from "obsidian";
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

	const openButton = new ButtonComponent(container)
		.setIcon("image")
		.setButtonText("Open")
		.setClass("area-detail-file-action-button")
		.setTooltip(file ? "Open attachment" : "Attachment not found")
		.setDisabled(!file)
		.onClick(async (evt) => {
			stopActionEvent(evt);
			if (await openAttachment(app, item)) onClose();
		});
	openButton.buttonEl.setAttribute("aria-label", "Open attachment");

	const revealButton = new ButtonComponent(container)
		.setIcon("folder-open")
		.setButtonText("Reveal")
		.setClass("area-detail-file-action-button")
		.setTooltip(file ? "Reveal in Files" : "Attachment not found")
		.setDisabled(!file)
		.onClick((evt) => {
			stopActionEvent(evt);
			if (revealAttachment(app, item)) onClose();
		});
	revealButton.buttonEl.setAttribute("aria-label", "Reveal in Files");

	if (canShowAttachmentInSystemFolder(app)) {
		const systemButton = new ButtonComponent(container)
			.setIcon("folder-search")
			.setButtonText("Folder")
			.setClass("area-detail-file-action-button")
			.setTooltip(file ? "Show in system folder" : "Attachment not found")
			.setDisabled(!file)
			.onClick((evt) => {
				stopActionEvent(evt);
				if (showAttachmentInSystemFolder(app, item)) onClose();
			});
		systemButton.buttonEl.setAttribute("aria-label", "Show in system folder");
	}
}

export function renderSourceActions(
	container: HTMLElement,
	item: AreaItem,
): SourceActionButtons {
	const openSourceButton = new ButtonComponent(container)
		.setIcon("external-link")
		.setButtonText("Open source")
		.onClick((evt) => {
			stopActionEvent(evt);
			openSourceUrl(item);
		});

	const copySourceButton = new ButtonComponent(container)
		.setIcon("copy")
		.setButtonText("Copy URL")
		.onClick((evt) => {
			stopActionEvent(evt);
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

	openSourceButton
		.setDisabled(false)
		.setTooltip(hasValidSource ? "Open source" : "Add a valid source URL first");
	copySourceButton
		.setDisabled(false)
		.setTooltip(hasSource ? "Copy source URL" : "Add a source URL first");
}

function stopActionEvent(evt: MouseEvent): void {
	evt.preventDefault();
	evt.stopPropagation();
}
