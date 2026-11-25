import { describe, expect, it } from "vitest";
import { computeView } from "./index";
import type { EngineInput, LedgerRow, Settings } from "./index";
import { sam } from "./fixtures";

function input(settings: Partial<Settings>, today: string): EngineInput {
  return { settings: { ...sam, ...settings }, occasions: [], earnDateEdits: {}, today };
}

const short = (r: LedgerRow) => `${r.earnDate} ${r.benefitType === "vacation" ? "V" : "FH"}`;

describe("E2: Sam's Ledger starts from the SAP Balance", () => {
  const view = computeView(
    input(
      { sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" },
      "2025-11-24",
    ),
  );
  const [y2025, y2026] = view.ledger.groups;

  it("groups this year and next, in order", () => {
    expect(view.ledger.groups.map((g) => g.year)).toEqual([2025, 2026]);
  });

  it("walks Vacation back newest first: Nov 12, Sep 10, Jul 9, May 14, May 14, all Estimated", () => {
    const vacation = y2025.rows.filter((r) => r.benefitType === "vacation");
    expect(vacation.map((r) => r.earnDate)).toEqual([
      "2025-05-14",
      "2025-05-14",
      "2025-07-09",
      "2025-09-10",
      "2025-11-12",
    ]);
    expect(vacation.every((r) => r.origin === "starting" && r.estimated)).toBe(true);
  });

  it("starts from one Floating Holiday, Sep 1 2025, which shows 'expires Dec 31'", () => {
    const fh = y2025.rows.filter((r) => r.benefitType === "floatingHoliday");
    expect(fh.map((r) => [r.earnDate, r.expiresWarning])).toEqual([["2025-09-01", true]]);
  });

  it("sorts the year group by Earn Date across Benefit Types", () => {
    expect(y2025.rows.map(short)).toEqual([
      "2025-05-14 V",
      "2025-05-14 V",
      "2025-07-09 V",
      "2025-09-01 FH",
      "2025-09-10 V",
      "2025-11-12 V",
    ]);
  });

  it("projects all of E1's 2026 entries, not Estimated and with no expiry warning", () => {
    expect(y2026.rows.map(short)).toEqual([
      "2026-01-01 FH",
      "2026-01-01 FH",
      "2026-01-01 FH",
      "2026-02-01 V",
      "2026-03-05 V",
      "2026-04-05 V",
      "2026-05-07 V",
      "2026-06-07 V",
      "2026-07-09 V",
      "2026-08-09 V",
      "2026-09-10 V",
      "2026-10-11 V",
      "2026-11-12 V",
    ]);
    expect(y2026.rows.every((r) => r.origin === "projected" && !r.estimated)).toBe(true);
    expect(y2026.rows.some((r) => r.expiresWarning)).toBe(false);
  });

  it("counts free Benefit Days: 15 Vacation, 4 Floating Holidays", () => {
    expect(view.ledger.free).toEqual({ vacation: 15, floatingHoliday: 4 });
  });

  it("has no leftover hours when the balances are whole days", () => {
    expect(view.ledger.leftoverHours).toEqual({ vacation: 0, floatingHoliday: 0 });
  });
});

describe("SAP Balance beyond what the schedule explains", () => {
  // Sam as of Nov 24, 2025 has 7 Vacation entries and 3 Floating Holiday entries in SAP.
  const view = computeView(
    input(
      { sapVacationHours: 68, sapFloatingHolidayHours: 36, sapAsOf: "2025-11-24" },
      "2025-11-24",
    ),
  );
  const rows = view.ledger.groups[0].rows;

  it("dates an extra Vacation row at the hire date, Estimated, as Carryover at the top", () => {
    const extra = rows.filter((r) => r.origin === "extra" && r.benefitType === "vacation");
    expect(extra.map((r) => [r.key, r.earnDate, r.estimated, r.carryover])).toEqual([
      ["vacation:extra:1", "2024-08-14", true, true],
    ]);
    expect(rows[0].key).toBe("vacation:extra:1");
  });

  it("dates an extra Floating Holiday row Jan 1 of the as-of year", () => {
    const extra = rows.filter((r) => r.origin === "extra" && r.benefitType === "floatingHoliday");
    expect(extra.map((r) => [r.key, r.earnDate, r.estimated])).toEqual([
      ["fh:2025:extra:1", "2025-01-01", true],
    ]);
  });

  it("keeps hours that don't make a whole day as a note", () => {
    expect(view.ledger.leftoverHours).toEqual({ vacation: 4, floatingHoliday: 4 });
  });

  it("rounds the leftover hours to 2 decimals, so 37.6 h is 4 days + 5.6 h", () => {
    // 37.6 % 8 is 5.600000000000001 in floating point.
    const decimals = computeView(
      input({ sapVacationHours: 37.6, sapFloatingHolidayHours: 12.3, sapAsOf: "2025-11-24" }, "2025-11-24"),
    );
    expect(decimals.ledger.leftoverHours).toEqual({ vacation: 5.6, floatingHoliday: 4.3 });
    expect(decimals.ledger.free.vacation).toBe(4 + 10);
  });
});

describe("rollover on Jan 1", () => {
  // E2's balance, still as of Nov 24, 2025, viewed on Jan 10, 2026.
  const view = computeView(
    input(
      { sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" },
      "2026-01-10",
    ),
  );
  const [y2026] = view.ledger.groups;

  it("shows this year and next", () => {
    expect(view.ledger.groups.map((g) => g.year)).toEqual([2026, 2027]);
  });

  it("turns last year's free Vacation into Carryover at the top of this year", () => {
    expect(y2026.rows.slice(0, 5).map((r) => [r.earnDate, r.carryover])).toEqual([
      ["2025-05-14", true],
      ["2025-05-14", true],
      ["2025-07-09", true],
      ["2025-09-10", true],
      ["2025-11-12", true],
    ]);
    expect(y2026.rows[5].carryover).toBe(false);
  });

  it("hides last year's unburned Floating Holiday and warns on this year's", () => {
    const fh = view.ledger.groups.flatMap((g) => g.rows).filter((r) => r.benefitType === "floatingHoliday");
    expect(fh.map((r) => [r.earnDate, r.expiresWarning])).toEqual([
      ["2026-01-01", true],
      ["2026-01-01", true],
      ["2026-01-01", true],
      ["2027-01-01", false],
      ["2027-01-01", false],
      ["2027-01-01", false],
    ]);
    // 5 Carryover + 10 in 2026 + 5 in 2027 reaches the 160 h cap; the rest of 2027 is Lost to cap.
    expect(view.ledger.free).toEqual({ vacation: 20, floatingHoliday: 6 });
  });
});

describe("before a hire date is entered", () => {
  it("is not configured and shows empty year groups", () => {
    const view = computeView(input({ hireDate: null }, "2025-11-24"));
    expect(view.configured).toBe(false);
    expect(view.ledger.groups.map((g) => [g.year, g.rows.length])).toEqual([
      [2025, 0],
      [2026, 0],
    ]);
  });
});
