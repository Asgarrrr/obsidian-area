// Prevent a click from doing its default and bubbling to a parent handler
// (e.g. a button inside a clickable card).
export function stopEvent(evt: Event): void {
	evt.preventDefault();
	evt.stopPropagation();
}
