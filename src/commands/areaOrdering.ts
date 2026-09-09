// Generic over the shape rather than TFile so bun can test it without the
// Obsidian runtime.
export function orderAreasByRecency<
	T extends { path: string; basename: string },
>(areas: T[], lastOpenPaths: string[]): T[] {
	const rank = new Map(lastOpenPaths.map((path, index) => [path, index]));
	return [...areas].sort((a, b) => {
		const rankA = rank.get(a.path) ?? Number.POSITIVE_INFINITY;
		const rankB = rank.get(b.path) ?? Number.POSITIVE_INFINITY;
		if (rankA !== rankB) return rankA - rankB;
		return a.basename.localeCompare(b.basename);
	});
}
