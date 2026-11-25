/**
 * Acceptance tests for "Accounts and devices" in docs/user-stories.md that run
 * without the emulator. Signing in and syncing (US-16) and privacy (US-17) are
 * in accounts.rules.test.ts; US-18 is in src/storage/savedDataCompat.test.ts
 * and src/engine/earnDateEdits.test.ts.
 */
import { describe, expect, it } from "vitest";
import { computeView } from "../../src/engine";
import { LocalDataStore, memoryStorage } from "../../src/storage";
import { occasion, samE2 } from "./helpers";

describe("US-16: Sign-in is optional and syncs", () => {
  it("US-16: keeps my data in this browser without signing in", async () => {
    const storage = memoryStorage();
    const data = {
      settings: samE2,
      occasions: [occasion("ski", "Made-up ski week", "2026-02-24", "2026-02-26")],
      earnDateEdits: {},
    };
    await new LocalDataStore(storage).save(data);

    // The next visit, still signed out.
    const loaded = await new LocalDataStore(storage).load();
    expect(loaded).toEqual(data);
    const view = computeView({ ...loaded!, today: "2025-11-24" });
    expect(view.configured).toBe(true);
    expect(view.occasions[0]).toMatchObject({ name: "Made-up ski week", ptoDays: 3 });
  });

  it("US-16: keeps working in memory when the browser refuses storage", async () => {
    const refusing = {
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {
        throw new Error("storage blocked");
      },
      removeItem: () => {
        throw new Error("storage blocked");
      },
    };
    const store = new LocalDataStore(refusing);
    const data = { settings: samE2, occasions: [], earnDateEdits: {} };
    await store.save(data);
    expect(await store.load()).toEqual(data);
  });
});
