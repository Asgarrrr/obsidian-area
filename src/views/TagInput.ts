import { AbstractInputSuggest, getAllTags, setIcon, type App } from "obsidian";
import {
	canonicalTag,
	mergeTags,
	normalizeAreaTagInput,
	parseTagInput,
	sameTags,
} from "../tagStrings";

const MAX_TAG_SUGGESTIONS = 25;

interface AreaTagEditorOptions {
	app: App;
	container: HTMLElement;
	tags: string[];
	getSuggestions: () => string[];
	onChange: (tags: string[]) => void;
	placeholder?: string;
}

export function formatAreaTag(tag: string): string {
	const value = tag.trim().replace(/^#+/, "");
	return value ? `#${value}` : "#";
}

export function renderAreaTagToken(
	container: HTMLElement,
	tag: string,
): HTMLElement {
	return container.createSpan({
		cls: "tag area-tag-token",
		text: formatAreaTag(tag),
	});
}

export function getVaultTagSuggestions(app: App): string[] {
	const suggestions = new Set<string>();

	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) continue;

		const tags = getAllTags(cache);
		if (!tags) continue;

		for (const tag of tags) {
			const normalized = normalizeAreaTagInput(tag);
			if (normalized) suggestions.add(normalized);
		}
	}

	return [...suggestions].sort((a, b) => a.localeCompare(b));
}

export class AreaTagSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private getCandidates: () => string[],
		private getCurrentTags: () => string[],
		private onChoose: (tag: string) => void,
	) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const normalizedQuery = normalizeAreaTagInput(query);
		if (!normalizedQuery) return [];

		const queryKey = canonicalTag(normalizedQuery);
		const current = new Set(this.getCurrentTags().map(canonicalTag));
		const seen = new Set<string>();
		const suggestions: string[] = [];

		for (const candidate of this.getCandidates()) {
			const normalized = normalizeAreaTagInput(candidate);
			if (!normalized) continue;

			const key = canonicalTag(normalized);
			if (current.has(key) || seen.has(key) || !key.includes(queryKey)) {
				continue;
			}

			suggestions.push(normalized);
			seen.add(key);

			if (suggestions.length >= MAX_TAG_SUGGESTIONS) break;
		}

		return suggestions;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.addClass("area-tag-suggestion");
		renderAreaTagToken(el, value);
	}

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		evt.preventDefault();
		this.onChoose(value);
		this.close();
	}
}

export function renderAreaTagEditor({
	app,
	container,
	tags,
	getSuggestions,
	onChange,
	placeholder = "Add tag...",
}: AreaTagEditorOptions): AreaTagSuggest {
	container.empty();
	container.addClass("multi-select-container");
	container.addClass("area-tag-editor");

	const commitInput = (inputEl: HTMLInputElement): void => {
		const nextTags = mergeTags(tags, parseTagInput(inputEl.value));
		inputEl.value = "";
		if (!sameTags(tags, nextTags)) onChange(nextTags);
	};

	const removeTag = (tag: string): void => {
		const tagKey = canonicalTag(tag);
		onChange(tags.filter((current) => canonicalTag(current) !== tagKey));
	};

	for (const tag of tags) {
		const pill = container.createDiv("multi-select-pill area-tag-editor-pill");
		const content = pill.createDiv("multi-select-pill-content");
		renderAreaTagToken(content, tag);

		const removeButton = pill.createDiv(
			"multi-select-pill-remove-button clickable-icon",
		);
		removeButton.setAttribute("aria-label", `Remove ${formatAreaTag(tag)}`);
		setIcon(removeButton, "x");
		removeButton.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			removeTag(tag);
		});
	}

	const inputWrap = container.createDiv("area-tag-editor-input-container");
	const inputEl = inputWrap.createEl("input", {
		type: "text",
		cls: "area-tag-editor-input",
	});
	inputEl.placeholder = placeholder;

	inputEl.addEventListener("keydown", (evt) => {
		if (evt.key === "Enter" || evt.key === ",") {
			evt.preventDefault();
			commitInput(inputEl);
			return;
		}

		if (evt.key === "Backspace" && inputEl.value === "" && tags.length > 0) {
			evt.preventDefault();
			onChange(tags.slice(0, -1));
		}
	});

	inputEl.addEventListener("input", () => {
		if (inputEl.value.includes(",")) commitInput(inputEl);
	});

	container.onclick = () => {
		inputEl.focus();
	};

	return new AreaTagSuggest(
		app,
		inputEl,
		() => mergeTags(getSuggestions(), tags),
		() => tags,
		(tag) => {
			const nextTags = mergeTags(tags, [tag]);
			inputEl.value = "";
			if (!sameTags(tags, nextTags)) onChange(nextTags);
		},
	);
}
