import { describe, expect, it } from "vitest";
import { LocalDataStore, memoryStorage } from "./index";
import { withDefaults } from "./dataStore";
import type { AppData } from "./dataStore";
import { fromStoredData } from "./firestoreDataStore";
import { sam } from "../engine/fixtures";

/** Made-up data only. */
const trip = { id: "trip", name: "Made-up trip", start: "2027-03-01", end: "2027-03-02", dayTypes: {} };
const data = (occasions: unknown[]): AppData =>
  withDefaults({ settings: { ...sam, sapAsOf: "2026-11-01" }, occasions } as Partial<AppData>);

describe("US-23: an Occasion's approval status is stored", () => {
  it("US-23: keeps an approved Occasion approved", () => {
    expect(data([{ ...trip, approved: true }]).occasions[0].approved).toBe(true);
  });

  it("US-23: an Occasion saved before approval existed loads as not approved, unchanged", () => {
    const [loaded] = data([trip]).occasions;
    expect(loaded.approved).toBeFalsy();
    // No field is added, so older saves read and write back in the same shape.
    expect(loaded).toEqual(trip);
  });

  it("US-23: anything but true counts as not approved", () => {
    for (const approved of [false, "yes", 1, null]) {
      expect(data([{ ...trip, approved }]).occasions[0]).toEqual(trip);
    }
  });

  it("US-23: round-trips through local storage, both ways", async () => {
    const storage = memoryStorage();
    const store = new LocalDataStore(storage);
    const before = data([trip]);
    const approved = { ...before, occasions: [{ ...trip, approved: true }] };
    await store.save(before);
    await store.update(before, approved);
    expect((await new LocalDataStore(storage).load())!.occasions[0].approved).toBe(true);

    await store.update(approved, before);
    expect((await new LocalDataStore(storage).load())!.occasions[0]).toEqual(trip);
  });

  it("US-23: loads from a Firestore version 2 document, and a version 1 list", () => {
    const v2 = fromStoredData({ occasionsById: { trip: { ...trip, approved: true } } });
    expect(v2.occasions[0].approved).toBe(true);
    const v1 = fromStoredData({ occasions: [trip, { ...trip, id: "other", approved: true }] });
    expect(v1.occasions.map((o) => [o.id, o.approved === true])).toEqual([
      ["trip", false],
      ["other", true],
    ]);
  });
});
