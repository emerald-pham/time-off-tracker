import { describe, expect, it } from "vitest";
import { computeView } from "./index";
import type { EarnDateEdits, EngineInput, Occasion, Settings, ViewModel } from "./index";
import { sam } from "./fixtures";

/** E2's starting point: Sam as of Mon Nov 24, 2025, SAP Vacation 40 h, Floating Holiday 8 h. */
const e2: Partial<Settings> = { sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" };

/** E4's Occasion: Tue Feb 24 – Thu Feb 26, 2026, all Vacation by default. */
const ski: Occasion = { id: "ski", name: "Ski week", start: "2026-02-24", end: "2026-02-26", dayTypes: {} };

function input(earnDateEdits: EarnDateEdits, settings: Partial<Settings> = {}): EngineInput {
  return { settings: { ...sam, ...e2, ...settings }, occasions: [ski], earnDateEdits, today: "2025-11-24" };
}

const rows = (view: ViewModel) => view.ledger.groups.flatMap((g) => g.rows);
const row = (view: ViewModel, key: string) => rows(view).find((r) => r.key === key);
const burnedBySki = (view: ViewModel) =>
  rows(view)
    .filter((r) => r.burnedBy?.occasionId === "ski")
    .map((r) => [r.key, r.earnDate]);

describe("Earn Date edits", () => {
  it("moving a row's Earn Date later changes which row an Occasion Burns", () => {
    // Without the edit, E4 Burns May 14, May 14 and Jul 9, 2025. Moved to Mar 1, 2026, May 14 is
    // no longer in SAP by the as-of date, so the walk-back's fifth day is the next newest, May 7.
    const view = computeView(input({ "vacation:hire:1": "2026-03-01" }));
    expect(burnedBySki(view)).toEqual([
      ["vacation:2025:2", "2025-05-07"],
      ["vacation:hire:2", "2025-05-14"],
      ["vacation:2025:3", "2025-07-09"],
    ]);
    expect(row(view, "vacation:hire:1")).toMatchObject({
      earnDate: "2026-03-01",
      origin: "projected",
      edited: true,
      burnedBy: null,
    });
  });

  it("keeps the edit after weekly hours change", () => {
    // At 32 hours a week the hire year has only one Vacation entry (raw Oct 31, 2024).
    const view = computeView(input({ "vacation:hire:1": "2026-03-01" }, { weeklyHours: 32 }));
    expect(row(view, "vacation:hire:1")).toMatchObject({ earnDate: "2026-03-01", edited: true });
    expect(burnedBySki(view).map(([key]) => key)).not.toContain("vacation:hire:1");
  });

  it("ignores an edit whose key no longer exists", () => {
    const view = computeView(input({ "vacation:hire:2": "2025-01-02" }, { weeklyHours: 32 }));
    expect(row(view, "vacation:hire:2")).toBeUndefined();
    expect(rows(view).some((r) => r.edited || r.earnDate === "2025-01-02")).toBe(false);
  });

  describe("edits apply to the schedule before the walk-back", () => {
    // Mon Dec 1 – Mon Dec 8, 2025: six Vacation Days Off (Dec 6–7 are RDO), none Deducted.
    const dec: Occasion = { id: "dec", name: "December", start: "2025-12-01", end: "2025-12-08", dayTypes: {} };
    const decInput = (earnDateEdits: EarnDateEdits): EngineInput => ({ ...input(earnDateEdits), occasions: [dec] });
    const burnedByDec = (view: ViewModel) =>
      rows(view)
        .filter((r) => r.burnedBy?.occasionId === "dec")
        .map((r) => [r.key, r.earnDate]);

    it("without edits, SAP's 5 days cover 5 of December's 6", () => {
      expect(computeView(decInput({})).occasions[0].short).toBe(1);
    });

    it("a projected day moved before the as-of date is one of SAP's 5 days, not a sixth", () => {
      // Feb 1, 2026 moved to Nov 1, 2025 (paid Nov 6) is in SAP by Nov 24, so it joins the walk-back.
      const view = computeView(decInput({ "vacation:2026:1": "2025-11-01" }));
      expect(row(view, "vacation:2026:1")).toMatchObject({ origin: "starting", edited: true, estimated: false });
      expect(row(view, "vacation:hire:1")).toBeUndefined();
      expect(burnedByDec(view)).toEqual([
        ["vacation:hire:2", "2025-05-14"],
        ["vacation:2025:3", "2025-07-09"],
        ["vacation:2025:4", "2025-09-10"],
        ["vacation:2026:1", "2025-11-01"],
        ["vacation:2025:5", "2025-11-12"],
      ]);
      expect(view.occasions[0].short).toBe(1);
    });

    it("a starting day moved past the as-of date is projected, and the walk-back takes the next newest", () => {
      // Nov 12, 2025 moved to Dec 15, 2025 (paid Dec 25) isn't in SAP by Nov 24.
      const view = computeView(decInput({ "vacation:2025:5": "2025-12-15" }));
      expect(row(view, "vacation:2025:5")).toMatchObject({ origin: "projected", edited: true, burnedBy: null });
      expect(burnedByDec(view)).toEqual([
        ["vacation:2025:2", "2025-05-07"],
        ["vacation:hire:1", "2025-05-14"],
        ["vacation:hire:2", "2025-05-14"],
        ["vacation:2025:3", "2025-07-09"],
        ["vacation:2025:4", "2025-09-10"],
      ]);
      expect(view.occasions[0].short).toBe(1);
    });
  });

  describe("every edited row stays on the Ledger, so Reset to projected stays reachable", () => {
    const shown = (view: ViewModel) => view.ledger.groups.flatMap((g) => g.rows);
    const freeShown = (view: ViewModel, type: "vacation" | "floatingHoliday") =>
      shown(view).filter((r) => r.benefitType === type && !r.burnedBy && !r.lostToCap && !r.expired && !r.usedNotListed)
        .length;

    it("a row moved past the last year shown adds that year's group", () => {
      // Nov 12, 2026 moved to Jan 15, 2027; as of Nov 24, 2025 the Ledger shows 2025 and 2026.
      const view = computeView({ ...input({ "vacation:2026:10": "2027-01-15" }), occasions: [] });
      expect(view.ledger.groups.map((g) => g.year)).toEqual([2025, 2026, 2027]);
      const year2027 = view.ledger.groups[2].rows.map((r) => r.key);
      expect(year2027).toContain("vacation:2026:10");
    });

    it("counts only rows it shows as free", () => {
      const view = computeView({ ...input({ "vacation:2026:10": "2027-01-15" }), occasions: [] });
      expect(view.ledger.free).toEqual({
        vacation: freeShown(view, "vacation"),
        floatingHoliday: freeShown(view, "floatingHoliday"),
      });
    });

    it("a Floating Holiday moved into a past year stays listed, as Used (not listed), not hidden", () => {
      // Jun 1, 2024 is long before the as-of year, so it can't be one of SAP's Floating Holidays.
      const view = computeView({ ...input({ "fh:2026:1": "2024-06-01" }), occasions: [] });
      expect(shown(view).find((r) => r.key === "fh:2026:1")).toMatchObject({
        earnDate: "2024-06-01",
        edited: true,
        usedNotListed: true,
        burnedBy: null,
      });
      // Not free: 2025's Sep 1 and 2026's other two are.
      expect(view.ledger.free.floatingHoliday).toBe(3);
    });

    it("a Floating Holiday moved past the as-of date into an earlier year stays listed as Expired", () => {
      // Viewed Mar 1, 2026 with the Nov 24, 2025 balance: Jan 1, 2026 moved to Dec 1, 2025.
      const view = computeView({ ...input({ "fh:2026:1": "2025-12-01" }), occasions: [], today: "2026-03-01" });
      expect(shown(view).find((r) => r.key === "fh:2026:1")).toMatchObject({ edited: true, expired: true });
    });

    it("a starting day moved earlier stays one of SAP's days instead of dropping out", () => {
      // Nov 12, 2025 moved to Mar 1, 2025, older than every other day in SAP.
      const view = computeView({ ...input({ "vacation:2025:5": "2025-03-01" }), occasions: [] });
      expect(row(view, "vacation:2025:5")).toMatchObject({ origin: "starting", earnDate: "2025-03-01", edited: true });
      const starting = shown(view).filter((r) => r.benefitType === "vacation" && r.origin === "starting");
      expect(starting.map((r) => r.key)).toEqual([
        "vacation:2025:5",
        "vacation:hire:1",
        "vacation:hire:2",
        "vacation:2025:3",
        "vacation:2025:4",
      ]);
    });

    it("an edited day that SAP already shows used is listed Used (not listed), so it can be reset", () => {
      // SAP 0 h: Feb 1, 2026 moved to Nov 1, 2025 is in SAP's dates, but SAP has no days left.
      const view = computeView({
        ...input({ "vacation:2026:1": "2025-11-01" }, { sapVacationHours: 0 }),
        occasions: [],
      });
      expect(row(view, "vacation:2026:1")).toMatchObject({ edited: true, usedNotListed: true, burnedBy: null });
      expect(view.ledger.free.vacation).toBe(9);
    });
  });

  it("marks the row Edited, not Estimated; with no edit it is back to its walked-back date", () => {
    const edited = computeView(input({ "vacation:2025:5": "2025-11-01" }));
    expect(row(edited, "vacation:2025:5")).toMatchObject({ earnDate: "2025-11-01", edited: true, estimated: false });
    const reset = computeView(input({}));
    expect(row(reset, "vacation:2025:5")).toMatchObject({ earnDate: "2025-11-12", edited: false, estimated: true });
  });
});
