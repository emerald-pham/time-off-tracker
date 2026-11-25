import { describe, expect, it } from "vitest";
import { computeView } from "../engine";
import { emptyAppData, isEmptyAppData, sameAppData, withDefaults } from "./dataStore";
import type { AppData } from "./dataStore";
import { sam } from "../engine/fixtures";

/** Loads something shaped like a damaged or hand-edited save. */
const load = (raw: unknown) => withDefaults(raw as Partial<AppData>);

describe("withDefaults: what a save is allowed to hold", () => {
  it("keeps weekly hours between 1 and 80, so a tiny value can't crash the Ledger", () => {
    expect(load({ settings: { weeklyHours: 0.00002 } }).settings.weeklyHours).toBe(1);
    expect(load({ settings: { weeklyHours: 500 } }).settings.weeklyHours).toBe(80);
    expect(load({ settings: { weeklyHours: 37.5 } }).settings.weeklyHours).toBe(37.5);
    expect(load({ settings: { weeklyHours: "40" } }).settings.weeklyHours).toBe(40);
    expect(load({ settings: { weeklyHours: Number.NaN } }).settings.weeklyHours).toBe(40);
  });

  it("keeps SAP balances between 0 and 2,000 hours", () => {
    const { settings } = load({ settings: { sapVacationHours: 4_000_000, sapFloatingHolidayHours: -8 } });
    expect([settings.sapVacationHours, settings.sapFloatingHolidayHours]).toEqual([2000, 0]);
  });

  it("drops dates outside 1950–2100 or that aren't real dates", () => {
    const { settings } = load({ settings: { hireDate: "0024-08-14", sapAsOf: "2025-02-30" } });
    expect([settings.hireDate, settings.sapAsOf]).toEqual([null, null]);
    expect(load({ settings: { hireDate: "2024-08-14" } }).settings.hireDate).toBe("2024-08-14");
  });

  it("keeps regular days off as distinct weekdays 0–6, in order", () => {
    expect(load({ settings: { regularDaysOff: [6, 1, 1, 7, "x", 0] } }).settings.regularDaysOff).toEqual([0, 1, 6]);
    expect(load({ settings: { regularDaysOff: "weekends" } }).settings.regularDaysOff).toEqual([]);
  });

  it("gives an Occasion saved without Day Types an empty set, so it gets defaults", () => {
    const { occasions } = load({ occasions: [{ id: "a", name: "Trip", start: "2026-03-02", end: "2026-03-03" }] });
    expect(occasions).toEqual([{ id: "a", name: "Trip", start: "2026-03-02", end: "2026-03-03", dayTypes: {} }]);
  });

  it("drops Occasions it can't use and Day Types outside the range or not a Day Type", () => {
    const { occasions } = load({
      occasions: [
        { id: "ok", name: "Trip", start: "2026-03-02", end: "2026-03-03", dayTypes: { "2026-03-02": "unpaid", "2026-03-03": "pto", "2026-04-01": "rdo" } },
        { id: "two-digit", name: "Typo", start: "0026-01-05", end: "2026-01-09", dayTypes: {} },
        { id: "", name: "No id", start: "2026-03-02", end: "2026-03-02" },
        { id: "ok", name: "Same id again", start: "2026-05-01", end: "2026-05-01" },
        "not an occasion",
      ],
    });
    expect(occasions).toEqual([
      { id: "ok", name: "Trip", start: "2026-03-02", end: "2026-03-03", dayTypes: { "2026-03-02": "unpaid" } },
    ]);
    expect(load({ occasions: { a: 1 } }).occasions).toEqual([]);
  });

  it("puts a backwards range the right way round", () => {
    const { occasions } = load({ occasions: [{ id: "a", name: "Trip", start: "2026-03-05", end: "2026-03-02", dayTypes: {} }] });
    expect([occasions[0].start, occasions[0].end]).toEqual(["2026-03-02", "2026-03-05"]);
  });

  it("keeps only Earn Date edits with a supported date", () => {
    expect(load({ earnDateEdits: { "vacation:2026:1": "2026-02-03", "vacation:2026:2": "0026-02-03", "fh:2026:1": 5 } }).earnDateEdits).toEqual({
      "vacation:2026:1": "2026-02-03",
    });
    expect(load({ earnDateEdits: null }).earnDateEdits).toEqual({});
  });

  it("drops fields it doesn't know", () => {
    const data = load({ settings: { ...sam, newField: 1 }, newTop: { a: 1 } });
    expect(Object.keys(data).sort()).toEqual(["earnDateEdits", "occasions", "settings"]);
    expect("newField" in data.settings).toBe(false);
  });

  it("whatever it's given, the engine can run on the result", () => {
    const data = load({
      settings: { hireDate: "2024-03-10", weeklyHours: 0.00002, sapVacationHours: 4e6, sapAsOf: "2026-11-24" },
      occasions: [{ id: "z", name: "old", start: "2026-03-02", end: "2026-03-03" }],
      earnDateEdits: null,
    });
    const view = computeView({ ...data, today: "2026-11-24" });
    expect(view.ledger.groups.flatMap((g) => g.rows).length).toBeLessThan(1000);
  });
});

describe("sameAppData", () => {
  const trip = (id: string) => ({ id, name: id, start: "2026-03-02", end: "2026-03-02", dayTypes: {} });

  it("ignores the order Occasions are stored in", () => {
    const a: AppData = { ...emptyAppData(), occasions: [trip("a"), trip("b")] };
    const b: AppData = { ...emptyAppData(), occasions: [trip("b"), trip("a")] };
    expect(sameAppData(a, b)).toBe(true);
  });

  it("still sees a real difference", () => {
    expect(sameAppData({ ...emptyAppData(), occasions: [trip("a")] }, emptyAppData())).toBe(false);
    expect(isEmptyAppData({ ...emptyAppData(), occasions: [trip("a")] })).toBe(false);
  });
});
