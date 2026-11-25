import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "check-deploy-env.mjs");
const dirs: string[] = [];

/** Runs the check in a fresh project folder holding `files`, with only PATH set besides `env`. */
function check(files: Record<string, string> = {}, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-env-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return spawnSync(process.execPath, [script], { cwd: dir, env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("npm run deploy's env check (finding 10)", () => {
  it("lets a build go ahead without the emulator flag", () => {
    expect(check({ ".env.local": "VITE_FIREBASE_PROJECT_ID=made-up\n" }).status).toBe(0);
  });

  it("refuses when .env.local sets VITE_FIREBASE_USE_EMULATORS", () => {
    const result = check({ ".env.local": "VITE_FIREBASE_USE_EMULATORS=true\n" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("VITE_FIREBASE_USE_EMULATORS");
  });

  it("refuses when a production env file sets it", () => {
    const result = check({ ".env.production": "VITE_FIREBASE_USE_EMULATORS=false\n" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("VITE_FIREBASE_USE_EMULATORS is set");
  });

  it("refuses when the shell sets it", () => {
    const result = check({}, { VITE_FIREBASE_USE_EMULATORS: "true" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("VITE_FIREBASE_USE_EMULATORS is set");
  });
});
