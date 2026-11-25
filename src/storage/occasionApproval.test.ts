import { describe, expect, it } from "vitest";
import { LocalDataStore, memoryStorage } from "./index";
import { withDefaults } from "./dataStore";
import type { AppData } from "./dataStore";
import { fromStoredData } from "./firestoreDataStore";
import { sam } from "../engine/fixtures";
import { approvedDates, computeView, withApprovedDays } from "../engine";
import type { Occasion } from "../engine";

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

describe("US-23: each Day Off is approved or not", () => {
  // Mon Mar 1 – Fri Mar 5, 2027.
  const week = { ...trip, end: "2027-03-05" };
  const days = ["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05"];

  it("US-23: stores approved days as approvedDays, only when there are some", () => {
    const partly = withApprovedDays(week, ["2027-03-03", "2027-03-01"]);
    expect(partly).toEqual({ ...week, approvedDays: ["2027-03-01", "2027-03-03"] });
    expect(withApprovedDays(partly, [])).toEqual(week);
  });

  it("US-23: also writes approved: true when every day is approved, so an older app shows it approved", () => {
    expect(withApprovedDays(week, days)).toEqual({ ...week, approvedDays: days, approved: true });
    expect(data([withApprovedDays(week, days)]).occasions[0].approved).toBe(true);
  });

  it("US-23: an Occasion saved with approved: true and no approvedDays has every day approved", () => {
    const [legacy] = data([{ ...week, approved: true }]).occasions;
    expect(legacy).toEqual({ ...week, approved: true });
    expect(approvedDates(legacy)).toEqual(days);
  });

  it("US-23: loads approvedDays, keeping only real dates in range, sorted and once each", () => {
    const [loaded] = data([
      { ...week, approvedDays: ["2027-03-04", "2027-03-02", "2027-03-02", "2027-02-28", "nope", 7] },
    ]).occasions;
    expect(loaded.approvedDays).toEqual(["2027-03-02", "2027-03-04"]);
    expect(approvedDates(loaded)).toEqual(["2027-03-02", "2027-03-04"]);
    expect(data([{ ...week, approvedDays: [] }]).occasions[0]).toEqual(week);
    expect(data([{ ...week, approvedDays: "all" }]).occasions[0]).toEqual(week);
  });

  it("US-23: the engine shows each day's approval, and whether all of them are", () => {
    const v = (o: Occasion) => computeView({ ...data([o]), today: "2026-11-24" }).occasions[0];
    const partly = v(withApprovedDays(week, ["2027-03-01", "2027-03-03"]));
    expect(partly.days.map((d) => d.approved)).toEqual([true, false, true, false, false]);
    expect(partly.approved).toBe(false);
    expect(v(withApprovedDays(week, days)).approved).toBe(true);
    expect(v({ ...week, approved: true }).days.every((d) => d.approved)).toBe(true);
  });

  it("US-23: approval changes nothing in Burning", () => {
    const burns = (o: Occasion) =>
      computeView({ ...data([o]), today: "2026-11-24" }).occasions[0].days.map((d) => d.burns);
    const plain = { ...week, dayTypes: Object.fromEntries(days.map((d) => [d, "vacation" as const])) };
    expect(burns(plain).filter(Boolean).length).toBeGreaterThan(0);
    expect(burns(withApprovedDays(plain, ["2027-03-02"]))).toEqual(burns(plain));
    expect(burns(withApprovedDays(plain, days))).toEqual(burns(plain));
  });

  it("US-23: round-trips approvedDays through local storage and a Firestore version 2 document", async () => {
    const partly = withApprovedDays(week, ["2027-03-02"]);
    const storage = memoryStorage();
    const before = data([week]);
    await new LocalDataStore(storage).save(before);
    await new LocalDataStore(storage).update(before, data([partly]));
    expect((await new LocalDataStore(storage).load())!.occasions[0]).toEqual(partly);
    expect(fromStoredData({ occasionsById: { trip: partly } }).occasions[0]).toEqual(partly);
  });
});
