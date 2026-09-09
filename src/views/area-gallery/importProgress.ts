import { Notice } from "obsidian";

const IMMEDIATE_THRESHOLD = 3; // files — larger batches show progress at once
const DELAY_MS = 800; // small batches only surface if they turn out slow

/**
 * Progress notice for one import batch. dispose() must run in a finally:
 * without it, an import finishing just before the delay timer fires would
 * leak a zero-duration Notice nobody can dismiss.
 */
export function createImportProgress(total: number): {
	onProgress: (done: number, total: number) => void;
	dispose: () => void;
} {
	let notice: Notice | null = null;
	let timer: number | null = null;
	let message = formatProgress(0, total);

	const show = () => {
		notice ??= new Notice(message, 0);
	};

	if (total > IMMEDIATE_THRESHOLD) show();
	else timer = window.setTimeout(show, DELAY_MS);

	return {
		onProgress: (done, currentTotal) => {
			message = formatProgress(done, currentTotal);
			notice?.setMessage(message);
		},
		dispose: () => {
			if (timer !== null) window.clearTimeout(timer);
			timer = null;
			notice?.hide();
			notice = null;
		},
	};
}

function formatProgress(done: number, total: number): string {
	return `Area: importing ${done}/${total}…`;
}
