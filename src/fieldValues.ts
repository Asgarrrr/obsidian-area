import type { AreaItem, FieldValue } from "./types";

// The single write path for item.fields: empty means absent, and an emptied
// map is dropped so serialized items never carry a dangling `fields: {}`.
export function setCustomFieldValue(
	item: AreaItem,
	fieldId: string,
	value: FieldValue | undefined,
): void {
	if (value === undefined || value === "") {
		if (item.fields) {
			delete item.fields[fieldId];
			if (Object.keys(item.fields).length === 0) delete item.fields;
		}
		return;
	}

	if (!item.fields) item.fields = {};
	item.fields[fieldId] = value;
}
