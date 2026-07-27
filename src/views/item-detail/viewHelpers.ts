import { ButtonComponent } from "obsidian";

/** A ghost icon button carrying a tooltip and a matching aria-label. */
export function iconButton(
	container: HTMLElement,
	icon: string,
	label: string,
	onClick: (evt: MouseEvent) => void,
): ButtonComponent {
	const button = new ButtonComponent(container)
		.setIcon(icon)
		.setTooltip(label)
		.onClick(onClick);
	button.buttonEl.addClass("area-detail-icon-button");
	button.buttonEl.setAttr("aria-label", label);
	return button;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
