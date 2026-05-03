# Saved views custom filters

## Goal

Let users save reusable gallery views with search text, tag filters, custom field filters, and sort order. Old `.area` files must continue to work when the new `views` key is absent.

## Current state

Filtering currently lives in `src/views/area-gallery/filtering.ts` with `activeTagFilters`, `searchQuery`, and `SortOrder`. `AreaGalleryView` keeps this state in memory and passes it to `renderAreaToolbar`. `toolbar.ts` renders search, tag filter buttons, sort select, and schema configuration. Custom fields are defined in `types.ts` as `AreaFieldDef[]` and edited through `SchemaEditorModal` and item detail field helpers.

Current code touchpoints:

- `src/types.ts`
- `src/views/AreaGalleryView.ts`
- `src/views/area-gallery/filtering.ts`
- `src/views/area-gallery/toolbar.ts`
- `src/views/SchemaEditorModal.ts`
- `src/views/item-detail/fieldInputs.ts`

## User experience

Users should be able to create a saved view from the current search, tag filters, custom field filters, and sort order. Saved views appear in the toolbar as a select, menu, or compact tab list. Switching views updates the gallery immediately. Users can update the active saved view, rename it, or delete it.

The plugin should also support useful unsaved filtering. A user should not need to create a saved view just to search or filter temporarily.

## Data model / interfaces

Add an optional `views` array to `AreaFile`.

Suggested v1 shape:

```ts
export interface AreaSavedView {
	id: string;
	label: string;
	filters: AreaFilterState;
	sort: AreaSortState;
}

export interface AreaFilterState {
	searchQuery?: string;
	tags?: string[];
	fields?: AreaFieldFilter[];
}

export interface AreaFieldFilter {
	fieldId: string;
	operator: "is" | "is-not" | "contains" | "empty" | "not-empty";
	value?: FieldValue;
}

export type AreaSortState =
	| { type: "newest" | "oldest" | "title-az" | "title-za" }
	| { type: "field"; fieldId: string; direction: "asc" | "desc" };
```

Keep this optional:

- `views?: AreaSavedView[]`
- absent `views` means no saved views
- absent filter keys mean no filter for that dimension

## Implementation outline

1. Move current filter and sort state into serializable types in `types.ts` or a dedicated filter model module.
2. Update `filtering.ts` to accept the shared filter state and evaluate tag, search, and field filters.
3. Keep existing sort options working while adding custom field sort support.
4. Add view-local draft filter state in `AreaGalleryView` for unsaved changes.
5. Add optional `areaData.views` handling with stable IDs from `crypto.randomUUID()`.
6. Extend the toolbar with saved view selection plus create, update, rename, and delete actions.
7. Add custom field filter controls that are generated from `areaData.schema`.
8. Ensure saved views referencing deleted schema field IDs do not break rendering; show them as inactive, invalid, or silently ignore the missing field during filtering.
9. Save `.area` data only when creating, updating, renaming, or deleting saved views, not on every temporary search keystroke.
10. Keep JSON stable and readable.

## Edge cases

- `views` is absent in older files.
- A saved view references a tag that no item currently uses.
- A saved view references a schema field that was deleted.
- Field values have mixed types because old data was hand-edited.
- Number field filters receive invalid number input.
- Sorting by an empty or missing field should produce stable ordering.
- Deleting the active saved view should return to an unsaved default view.

## Test plan

- Open an old `.area` file without `views` and confirm it renders.
- Create a saved view with search, tags, field filters, and sort order.
- Switch between saved views and confirm gallery results update.
- Update and rename a saved view, then reopen the file and confirm persistence.
- Delete a saved view and confirm the JSON remains valid.
- Filter by text, url, number, and select custom fields.
- Sort by supported built-in fields and at least one custom field.
- Remove a schema field used by a saved view and confirm the view does not crash.

## Acceptance criteria

- Users can create, update, delete, and switch saved views.
- Saved views include search query, tag filters, schema field filters, and sort state.
- Old files remain compatible when `views` is absent.
- Custom field filtering works for supported field types.
- Sorting works for supported built-in fields and custom fields.
- `.area` JSON remains readable and stable.

## Agent boundaries

Do not implement bulk selection, item notes, or validation repair in this plan. Add only the validation needed to avoid crashes while reading saved view data. Deeper repair behavior belongs in [data validation repair](05-data-validation-repair.md).
