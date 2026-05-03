// Custom field types supported by the schema editor
export type FieldType = "text" | "url" | "number" | "select";

// Value stored per item for a given field
export type FieldValue = string | number;

// One field definition in an area's schema
export interface AreaFieldDef {
	id: string; // stable key — never renamed after creation
	label: string; // display name, editable
	type: FieldType;
	options?: string[]; // only used when type === "select"
}

export interface AreaItem {
	id: string;
	type: "image" | "video";
	vaultPath: string;
	sourceUrl?: string;
	tags: string[];
	addedAt: number;
	title?: string;
	fields?: Record<string, FieldValue>; // values keyed by AreaFieldDef.id
}

export interface AreaFile {
	version: "1";
	name: string;
	icon?: string;
	color?: string;
	schema?: AreaFieldDef[]; // absent = no custom fields
	items: AreaItem[];
}
