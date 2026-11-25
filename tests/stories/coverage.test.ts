/**
 * Every user story in docs/user-stories.md needs at least one acceptance test
 * whose title (`describe`, `it` or `test`) starts with its ID, e.g. `US-NN: …`
 * (see "Owner guidance is acceptance tests" in CLAUDE.md). This reads the test
 * files under src/ and tests/ as text, so it also sees the emulator tests that
 * only `npm run test:rules` runs.
 */
import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Stories whose tests come with the UI redesign, which owns them. The redesign
 * removes each ID from this list as it adds that story's test.
 */
const PENDING: string[] = [];

const stories = [...readFileSync("docs/user-stories.md", "utf8").matchAll(/\*\*(US-\d{2}):/g)].map((m) => m[1]);

const testFiles = globSync("{src,tests}/**/*.test.{ts,tsx}");

/** The ID a test or suite title starts with: `it("US-NN: …")`, `describe("US-NN: …")`, `it.fails("US-NN: …")`. */
const TITLE = /\b(?:describe|it|test)(?:\.(?:fails|concurrent|sequential))*\(\s*["'`](US-\d{2})\b/g;
const tested = new Set(testFiles.flatMap((f) => [...readFileSync(f, "utf8").matchAll(TITLE)].map((m) => m[1])));

describe("user story coverage", () => {
  it("finds the stories and the test files", () => {
    expect(stories.length).toBeGreaterThanOrEqual(24);
    expect(testFiles.length).toBeGreaterThan(0);
  });

  it("has an acceptance test for every story not pending", () => {
    const missing = stories.filter((id) => !PENDING.includes(id) && !tested.has(id));
    expect(missing).toEqual([]);
  });

  it("lists as pending only stories that exist and have no test yet", () => {
    expect(PENDING.filter((id) => !stories.includes(id))).toEqual([]);
    expect(PENDING.filter((id) => tested.has(id))).toEqual([]);
  });
});
