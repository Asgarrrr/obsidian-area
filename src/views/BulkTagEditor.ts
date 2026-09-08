import { setIcon, type App } from "obsidian";
import { canonicalTag, parseTagInput } from "../tagStrings";
import {
	cyclePill,
	type PillState,
	type TagPill,
} from "./area-gallery/bulkEdit";
import { AreaTagSuggest, formatAreaTag, renderAreaTagToken } from "./TagInput";

interface BulkTagEditorOptions {
	app: App;
	container: HTMLElement;
	/** Live draft owned by the modal; this editor mutates pill states in place. */
	pills: TagPill[];
	/** Selection size — the denominator new pills carry; pills may be empty. */
	total: number;
	getSuggestions: () => string[];
	onChange: () => void;
}

export interface BulkTagEditorHandle {
	/** Closes the suggestion popover bound to the current input element. */
	close(): void;
	/** True while the input holds a tag typed but not yet committed. */
	hasPendingInput(): boolean;
}

const STATE_LABEL: Record<PillState, string> = {
	partial: "kept as is — click to add to all",
	common: "added to all — click to remove from all",
	removed: "removed from all — click to revert",
	new: "will be added — press × to cancel",
};

// The bulk counterpart of renderAreaTagEditor. One pill per tag in the
// selection's union; a body click cycles the pill through the states defined
// in bulkEdit.cyclePill, so any misclick is undone by clicking again.
export function renderBulkTagEditor(
	options: BulkTagEditorOptions,
): BulkTagEditorHandle {
	const { app, container, pills, total, getSuggestions, onChange } = options;

	const rerender = (): void => {
		render();
		onChange();
	};

	// Pills promoted by typing rather than by a click. Their next click must undo
	// the promotion instead of advancing the cycle — see the click handler.
	const promotedByTyping = new Set<TagPill>();

	const addTag = (raw: string): void => {
		const key = canonicalTag(raw);
		if (!key) return;

		const existing = pills.find((pill) => canonicalTag(pill.tag) === key);
		// Typing a tag that already exists promotes its pill instead of
		// duplicating it; one click reverts, so no original data is at risk.
		if (existing) {
			if (existing.state !== "common" && existing.initial !== "new") {
				existing.state = "common";
				promotedByTyping.add(existing);
			}
		} else {
			pills.push({
				tag: raw,
				count: 0,
				total,
				initial: "new",
				state: "new",
			});
		}

		rerender();
		// The rerender replaced the input, so focus the fresh one: entering
		// several tags in a row must not need a click between each.
		inputEl?.focus();
	};

	// Each render replaces the input element, so the suggest instance and the
	// focus target are rebuilt with it — a suggest bound to a detached input
	// never fires again.
	let suggest: AreaTagSuggest | null = null;
	let inputEl: HTMLInputElement | null = null;

	const render = (): void => {
		container.empty();
		container.addClass("multi-select-container", "area-bulk-tag-editor");

		for (const pill of pills) {
			const pillEl = container.createDiv(
				`multi-select-pill area-bulk-pill area-bulk-pill--${pill.state}`,
			);
			pillEl.setAttribute("role", "button");
			pillEl.setAttribute(
				"aria-label",
				`${formatAreaTag(pill.tag)}: ${STATE_LABEL[pill.state]}`,
			);

			const content = pillEl.createDiv("multi-select-pill-content");
			renderAreaTagToken(content, pill.tag);
			if (pill.initial === "partial") {
				content.createSpan({
					cls: "area-bulk-pill-count",
					text: `(${pill.count}/${pill.total})`,
				});
			}

			if (pill.initial === "new") {
				const removeButton = pillEl.createDiv(
					"multi-select-pill-remove-button clickable-icon",
				);
				removeButton.setAttribute(
					"aria-label",
					`Cancel adding ${formatAreaTag(pill.tag)}`,
				);
				setIcon(removeButton, "x");
				removeButton.addEventListener("click", (evt) => {
					evt.preventDefault();
					evt.stopPropagation();
					pills.splice(pills.indexOf(pill), 1);
					rerender();
				});
			} else {
				pillEl.addEventListener("click", (evt) => {
					evt.preventDefault();
					// A click after a promote-by-typing must undo the promotion, never
					// advance toward removed — a changed mind never strips original data.
					if (promotedByTyping.has(pill)) {
						pill.state = pill.initial;
						promotedByTyping.delete(pill);
					} else {
						pill.state = cyclePill(pill);
					}
					rerender();
				});
			}
		}

		const inputWrap = container.createDiv("area-tag-editor-input-container");
		const input = inputWrap.createEl("input", {
			type: "text",
			cls: "area-tag-editor-input",
		});
		input.placeholder = "Add tag to all...";
		inputEl = input;

		input.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === ",") {
				evt.preventDefault();
				const tags = parseTagInput(input.value);
				input.value = "";
				for (const tag of tags) addTag(tag);
			}
		});

		suggest?.close();
		suggest = new AreaTagSuggest(
			app,
			input,
			getSuggestions,
			() => pills.filter((pill) => pill.state !== "removed").map((p) => p.tag),
			(tag) => {
				input.value = "";
				addTag(tag);
			},
		);
	};

	render();

	return {
		close: () => suggest?.close(),
		hasPendingInput: () => (inputEl?.value ?? "").trim() !== "",
	};
}
