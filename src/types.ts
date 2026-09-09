// Custom field types supported by the schema editor
export type FieldType = "text" | "url" | "number" | "select";

// Value stored per item for a given field
export type FieldValue = string | number;

// One field definition in an area's schema
export interface AreaFieldDef {
	id: string; // stable key — never renamed after creation
	label: string;
	type: FieldType;
	options?: string[]; // only used when type === "select"
}

// How the gallery orders items. Serializable, so a saved view can carry it —
// the built-in orders name themselves, a field sort names the field it ranks by.
export type AreaSortState =
	| { type: "newest" | "oldest" | "title-az" | "title-za" }
	| { type: "field"; fieldId: string; direction: "asc" | "desc" };

// One constraint on a custom field. Modelled as a discriminated union so an
// operator can't carry a payload it has no use for — `empty` has no value,
// `is` always has a list, `contains` always has a single needle.
export type AreaFieldFilter =
	| { fieldId: string; operator: "is" | "is-not"; values: FieldValue[] }
	| { fieldId: string; operator: "contains"; value: string }
	| { fieldId: string; operator: "empty" | "not-empty" };

export interface AreaItem {
	id: string;
	type: "image" | "video";
	vaultPath: string;
	thumbPath?: string; // downscaled copy generated at import; absent = render the original
	sourceUrl?: string;
	tags: string[];
	addedAt: number;
	title?: string;
	aspectRatio?: number; // width / height, captured at import so masonry can size the card before the image loads
	fields?: Record<string, FieldValue>; // values keyed by AreaFieldDef.id
}

// A reusable gallery state. Absent keys mean "no filter on that dimension",
// so an unfiltered view serializes as `{}` rather than a wall of empty arrays.
export interface AreaFilterState {
	searchQuery?: string;
	tags?: string[];
	fields?: AreaFieldFilter[];
}

export interface AreaSavedView {
	id: string;
	label: string;
	filters: AreaFilterState;
	sort?: AreaSortState; // absent = the default order
}

export interface AreaFile {
	version: "1";
	name: string;
	icon?: string;
	color?: string;
	schema?: AreaFieldDef[]; // absent = no custom fields
	views?: AreaSavedView[]; // absent = no saved views
	items: AreaItem[];
}
