// Field-id slugging and select-option parsing for the schema editor.

export function createFieldId(label: string): string {
	return (
		label
			.trim()
			.toLowerCase()
			.normalize("NFKD")
			.replace(/\p{Diacritic}/gu, "")
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "") || "field"
	);
}

export function parseSelectOptions(value: string): string[] {
	const options: string[] = [];
	for (const option of value.split(",")) {
		const trimmed = option.trim();
		if (trimmed && !hasOption(options, trimmed)) options.push(trimmed);
	}
	return options;
}

export function hasOption(options: string[], value: string): boolean {
	const key = value.toLowerCase();
	return options.some((option) => option.toLowerCase() === key);
}
