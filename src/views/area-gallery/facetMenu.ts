import { setIcon } from "obsidian";
import type { Facet } from "./facets";

// A multi-select popover for one facet. Obsidian's own Menu closes on every
// item click, which makes picking three palettes a three-menu chore — this one
// stays open until you dismiss it, and styles itself with the theme's .menu
// classes so it still looks native.

interface FacetMenuOptions {
	anchor: HTMLElement;
	facet: Facet;
	isActive: (tag: string) => boolean;
	onToggle: (tag: string) => void;
}

interface OpenMenu {
	el: HTMLElement;
	anchor: HTMLElement;
	listeners: AbortController;
}

const VIEWPORT_MARGIN = 8;

let openMenu: OpenMenu | null = null;

export function isFacetMenuOpenFor(anchor: HTMLElement): boolean {
	return openMenu?.anchor === anchor;
}

export function closeFacetMenu(): void {
	if (!openMenu) return;
	const { el, listeners } = openMenu;
	openMenu = null;
	listeners.abort();
	el.remove();
}

export function openFacetMenu({
	anchor,
	facet,
	isActive,
	onToggle,
}: FacetMenuOptions): void {
	closeFacetMenu();

	const el = document.body.createDiv("menu area-facet-menu");
	el.setAttribute("role", "group");
	el.setAttribute("aria-label", `${facet.label} filters`);

	const listeners = new AbortController();
	const { signal } = listeners;
	openMenu = { el, anchor, listeners };

	for (const value of facet.values) {
		renderFacetItem(el, value, isActive, onToggle);
	}

	position(el, anchor);

	// mousedown (not click) so the menu is gone before the click lands, but the
	// anchor is excluded: its own click handler toggles the menu shut instead,
	// otherwise re-clicking the button would close then immediately reopen.
	document.addEventListener(
		"mousedown",
		(evt) => {
			const target = evt.target as Node | null;
			if (target && (el.contains(target) || anchor.contains(target))) return;
			closeFacetMenu();
		},
		{ signal, capture: true },
	);

	el.addEventListener("keydown", (evt) => onMenuKeyDown(evt, el, anchor), {
		signal,
	});

	window.addEventListener("resize", () => closeFacetMenu(), { signal });
	// Any scroll outside the menu moves the anchor out from under it.
	document.addEventListener("scroll", () => closeFacetMenu(), {
		signal,
		capture: true,
	});

	el.querySelector<HTMLElement>(".menu-item")?.focus();
}

function renderFacetItem(
	menuEl: HTMLElement,
	value: Facet["values"][number],
	isActive: (tag: string) => boolean,
	onToggle: (tag: string) => void,
): void {
	const item = menuEl.createDiv("menu-item area-facet-item");
	item.tabIndex = 0;
	item.setAttribute("role", "menuitemcheckbox");

	const check = item.createSpan("area-facet-item-check");
	const label = item.createSpan({
		cls: "area-facet-item-label",
		text: value.label,
	});
	label.setAttribute("title", value.label);
	item.createSpan({
		cls: "area-facet-item-count",
		text: String(value.count),
	});

	const sync = () => {
		const active = isActive(value.tag);
		item.classList.toggle("is-active", active);
		item.setAttribute("aria-checked", String(active));
		check.empty();
		if (active) setIcon(check, "check");
	};

	const toggle = () => {
		onToggle(value.tag);
		sync();
	};

	item.addEventListener("click", toggle);
	item.addEventListener("keydown", (evt) => {
		if (evt.key === "Enter" || evt.key === " ") {
			evt.preventDefault();
			toggle();
		}
	});

	sync();
}

function onMenuKeyDown(
	evt: KeyboardEvent,
	menuEl: HTMLElement,
	anchor: HTMLElement,
): void {
	if (evt.key === "Escape") {
		evt.preventDefault();
		closeFacetMenu();
		anchor.focus();
		return;
	}

	if (evt.key !== "ArrowDown" && evt.key !== "ArrowUp") return;

	evt.preventDefault();
	const items = Array.from(menuEl.querySelectorAll<HTMLElement>(".menu-item"));
	if (items.length === 0) return;

	const current = items.indexOf(document.activeElement as HTMLElement);
	const delta = evt.key === "ArrowDown" ? 1 : -1;
	// Wrap so the list cycles rather than dead-ending at either extremity.
	const next = (current + delta + items.length) % items.length;
	items[next]?.focus();
}

// Hang the menu under its button, pulled back inside the viewport on both axes.
// Flips above the anchor when the space below can't hold it.
function position(el: HTMLElement, anchor: HTMLElement): void {
	const anchorRect = anchor.getBoundingClientRect();
	const menuRect = el.getBoundingClientRect();

	const left = Math.max(
		VIEWPORT_MARGIN,
		Math.min(
			anchorRect.left,
			window.innerWidth - menuRect.width - VIEWPORT_MARGIN,
		),
	);

	const below = anchorRect.bottom + 4;
	const fitsBelow =
		below + menuRect.height <= window.innerHeight - VIEWPORT_MARGIN;
	const top = fitsBelow
		? below
		: Math.max(VIEWPORT_MARGIN, anchorRect.top - menuRect.height - 4);

	el.style.left = `${left}px`;
	el.style.top = `${top}px`;
}
