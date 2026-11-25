import { describe, expect, it } from "vitest";
import { computeView } from "../engine";
import type { LedgerRow, ViewModel } from "../engine";
import { LocalDataStore } from "./index";
import type { KeyValueStorage } from "./index";
import { fromStoredData } from "./firestoreDataStore";

/**
 * Saves exactly as the version before the eligibility-date change wrote
 * them. Everything here is made up ("Sam" from the spec's worked examples).
 * These must keep loading, computing and saving back unchanged.
 */
const savedSettings = {
  hireDate: "2024-08-14",
  weeklyHours: 40,
  regularDaysOff: [0, 6],
  sapVacationHours: 43,
  sapFloatingHolidayHours: 8,
  sapAsOf: "2025-11-24",
  fullYearHistory: false,
};
const savedEarnDateEdits = {
  // Keys from before the change: hire-year and pre-eligibility 2025 entries keep their keys.
  "vacation:hire:2": "2025-06-02",
  "vacation:2025:1": "2025-04-01",
  "fh:2026:2": "2026-02-02",
};
const ski = {
  id: "occ-ski",
  name: "Made-up ski week",
  start: "2026-02-24",
  end: "2026-02-26",
  dayTypes: { "2026-02-25": "floatingHoliday" },
};
const beach = { id: "occ-beach", name: "Made-up beach trip", start: "2026-07-13", end: "2026-07-14", dayTypes: {} };

/** Local storage, key "time-off-tracker": `{ version: 1, data: AppData }`. */
const localSave = JSON.stringify({
  version: 1,
  data: { settings: savedSettings, occasions: [ski, beach], earnDateEdits: savedEarnDateEdits },
});

/** A Firestore version 2 document that started at version 1: the old list, overlaid by `occasionsById`. */
const firestoreV2 = {
  version: 2,
  updatedAt: 1764000000000,
  data: {
    settings: savedSettings,
    earnDateEdits: savedEarnDateEdits,
    occasions: [ski, { ...beach, name: "Old beach name" }],
    occasionsById: { [beach.id]: beach, "occ-deleted": null },
  },
};

function storageWith(raw: string): KeyValueStorage & { raw: Map<string, string> } {
  const map = new Map([["time-off-tracker", raw]]);
  return {
    raw: map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const rowsOf = (view: ViewModel) => view.ledger.groups.flatMap((g) => g.rows);
const row = (view: ViewModel, key: string): LedgerRow | undefined => rowsOf(view).find((r) => r.key === key);

function expectComputesWithEditsAttached(view: ViewModel) {
  expect(view.configured).toBe(true);
  expect(view.occasions.map((o) => o.name)).toEqual(["Made-up ski week", "Made-up beach trip"]);
  for (const [key, date] of Object.entries(savedEarnDateEdits)) {
    expect(row(view, key)).toMatchObject({ earnDate: date, edited: true });
  }
}

describe("data saved by the previous version", () => {
  it("US-18: loads from local storage and computes, with every Earn Date edit on its row", async () => {
    const data = await new LocalDataStore(storageWith(localSave)).load();
    expect(data).toEqual({ settings: savedSettings, occasions: [ski, beach], earnDateEdits: savedEarnDateEdits });
    expectComputesWithEditsAttached(computeView({ ...data!, today: "2025-11-24" }));
  });

  it("US-18: saves back to local storage in the same shape", async () => {
    const storage = storageWith(localSave);
    const store = new LocalDataStore(storage);
    await store.save((await store.load())!);
    expect(JSON.parse(storage.raw.get("time-off-tracker")!)).toEqual(JSON.parse(localSave));
  });

  it("US-18: loads a Firestore version 2 document (with a version 1 list) and computes", () => {
    const data = fromStoredData(firestoreV2.data);
    expect(data.occasions).toEqual([ski, beach]);
    expectComputesWithEditsAttached(computeView({ ...data, today: "2025-11-24" }));
  });

  it("US-18: a date saved without a Day Type still gets the old default from the saved regular days off", () => {
    const data = fromStoredData(firestoreV2.data);
    const types = (v: ViewModel) => v.occasions.map((o) => o.days.map((d) => d.dayType));
    // Saturday and Sunday off: Tue–Thu ski week around its stored Floating Holiday, and Mon–Tue beach days, are Vacation.
    expect(types(computeView({ ...data, today: "2025-11-24" }))).toEqual([
      ["vacation", "floatingHoliday", "vacation"],
      ["vacation", "vacation"],
    ]);
    // With no regular days off saved (any save since the weekly rule), the weekly rule fills them (US-25).
    const noRegularDaysOff = { ...data, settings: { ...data.settings, regularDaysOff: [] } };
    expect(types(computeView({ ...noRegularDaysOff, today: "2025-11-24" }))).toEqual([
      ["rdo", "floatingHoliday", "vacation"],
      ["rdo", "rdo"],
    ]);
  });

  it("shows what a returning user will notice: unedited pre-eligibility days move to May 14, 2025", () => {
    const view = computeView({ ...fromStoredData(firestoreV2.data), earnDateEdits: {}, today: "2025-11-24" });
    // Credited May 7, 2025; the previous version showed May 7.
    expect(row(view, "vacation:2025:2")).toMatchObject({ earnDate: "2025-05-14", edited: false });
    // 43 h counts as 5 days; the 3 hours left over no longer show on the Ledger.
    expect(view.ledger).not.toHaveProperty("leftoverHours");
  });
});
