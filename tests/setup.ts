import { mock } from "bun:test";

// The `obsidian` npm package is types-only (empty "main"), so any source module
// that imports runtime values from it (Notice, normalizePath, …) can't load
// under `bun test` without a stub. Only the surface the unit tests touch is
// stubbed here — pure logic is what we're exercising, not Obsidian itself.
mock.module("obsidian", () => ({
	Notice: class {
		constructor(_message?: string) {}
	},
	normalizePath: (path: string) => path,
}));
