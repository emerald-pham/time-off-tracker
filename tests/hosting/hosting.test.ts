/**
 * firebase.json's Hosting headers and rewrites, against the Hosting emulator
 * serving a fresh build. Run with `npm run test:hosting` (demo project only).
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const { emulators } = JSON.parse(readFileSync("firebase.json", "utf8")) as {
  emulators: { hosting: { port: number } };
};
const base = `http://127.0.0.1:${emulators.hosting.port}`;
const builtScript = readdirSync("dist/assets").find((f) => f.endsWith(".js"))!;
const PAGE = '<div id="root">';

describe("Hosting (finding 11)", () => {
  it.each(["/", "/index.html", "/some/route"])("serves the page at %s, always revalidated", async (path) => {
    const response = await fetch(base + path);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(await response.text()).toContain(PAGE);
  });

  it("caches built assets for a year", async () => {
    const response = await fetch(`${base}/assets/${builtScript}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("answers a missing chunk with a 404, not the page", async () => {
    const response = await fetch(`${base}/assets/index-NOT-BUILT.js`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(PAGE);
  });

  it("revalidates everything else, like the manifest and icons", async () => {
    for (const path of ["/manifest.webmanifest", "/icons/icon-192.png"]) {
      const response = await fetch(base + path);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-cache");
    }
  });
});
