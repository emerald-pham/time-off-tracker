import { describe, expect, it } from "vitest";
import { computeView, sapBalanceDays } from "./index";
import type { EngineInput, LedgerRow, Occasion, Settings } from "./index";
import { sam, vacationOnWeekdays } from "./fixtures";

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

  it("walks Vacation back newest first: Nov 12, Sep 10, Jul 9, May 14, May 14, all Approximate", () => {
    const vacation = y2025.rows.filter((r) => r.benefitType === "vacation");
    expect(vacation.map((r) => r.earnDate)).toEqual([
      "2025-05-14",
      "2025-05-14",
      "2025-07-09",
      "2025-09-10",
      "2025-11-12",
    ]);
    expect(vacation.every((r) => r.origin === "starting" && r.approximate)).toBe(true);
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

  it("projects all of E1's 2026 entries, not Approximate and with no expiry warning", () => {
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
    expect(y2026.rows.every((r) => r.origin === "projected" && !r.approximate)).toBe(true);
    expect(y2026.rows.some((r) => r.expiresWarning)).toBe(false);
  });

  it("counts free Benefit Days: 15 Vacation, 4 Floating Holidays", () => {
    expect(view.ledger.free).toEqual({ vacation: 15, floatingHoliday: 4 });
  });
});

describe("free time off now, by the end of this year and by the end of next year", () => {
  // E2's balance (as of Nov 24, 2025) viewed on Mar 1, 2026. A made-up Occasion on
  // Mon Jun 1 – Tue Jun 2, 2026 uses one Floating Holiday and one Vacation day.
  const june: Occasion = {
    id: "june",
    name: "June days",
    start: "2026-06-01",
    end: "2026-06-02",
    dayTypes: { "2026-06-01": "floatingHoliday", "2026-06-02": "vacation" },
  };
  const view = computeView({
    ...input({ sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" }, "2026-03-01"),
    occasions: [june],
  });

  it("US-22: counts Benefit Days not used by any Occasion, earned now and by each year end", () => {
    expect(view.ledger.freeBy).toEqual({
      thisYear: 2026,
      // 5 Carryover + Feb 1, less the one Jun 2 uses; 2026's three Jan 1 Floating Holidays, less Jun 1's.
      earnedNow: { vacation: 5, floatingHoliday: 2 },
      // All ten 2026 days are earned by Dec 31.
      endOfThisYear: { vacation: 14, floatingHoliday: 2 },
      // 2027 earns 6 more before the 160 h cap; 2026's Floating Holidays expire, 2027's three count.
      endOfNextYear: { vacation: 20, floatingHoliday: 3 },
    });
  });

  it("US-22: gives each year group its own By end of <year> totals", () => {
    expect(view.ledger.groups.map((g) => [g.year, g.freeByEnd])).toEqual([
      [2026, view.ledger.freeBy.endOfThisYear],
      [2027, view.ledger.freeBy.endOfNextYear],
    ]);
  });

  it("US-22: a third year an Occasion reaches gets its own By end of totals", () => {
    const later: Occasion = { id: "later", name: "Later", start: "2028-03-06", end: "2028-03-06", dayTypes: {} };
    const three = computeView({
      ...input({ sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" }, "2026-03-01"),
      occasions: [june, later],
    });
    const [, y2027, y2028] = three.ledger.groups;
    expect(y2028.year).toBe(2028);
    // 2027's Floating Holidays have expired by Dec 31, 2028; 2028's three count.
    // Vacation carries over: 2027's total plus 2028's free days.
    expect(y2028.freeByEnd.floatingHoliday).toBe(3);
    const freeIn2028 = y2028.rows.filter((r) => r.benefitType === "vacation" && !r.burnedBy && !r.lostToCap).length;
    expect(y2028.freeByEnd.vacation).toBe(y2027.freeByEnd.vacation + freeIn2028);
  });

  it("US-22: leaves out days Lost to cap", () => {
    const lost = view.ledger.groups.flatMap((g) => g.rows).filter((r) => r.lostToCap);
    expect(lost.length).toBe(4);
    expect(lost.every((r) => r.earnDate.startsWith("2027"))).toBe(true);
  });
});

describe("Earned and Estimated (not yet earned) rows", () => {
  // E2's balance viewed on Nov 12, 2025, the day the last 2025 Vacation day is earned.
  const view = computeView(
    input({ sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" }, "2025-11-12"),
  );
  const [y2025, y2026] = view.ledger.groups;

  it("US-15: marks an Earn Date on or before today as earned", () => {
    expect(y2025.rows.map((r) => [r.earnDate, r.notYetEarned])).toEqual([
      ["2025-05-14", false],
      ["2025-05-14", false],
      ["2025-07-09", false],
      ["2025-09-01", false],
      ["2025-09-10", false],
      ["2025-11-12", false],
    ]);
  });

  it("US-15: marks an Earn Date later than today as not yet earned", () => {
    expect(y2026.rows.every((r) => r.notYetEarned)).toBe(true);
  });

  it("follows today, not the SAP Balance as-of date", () => {
    const earlier = computeView(
      input({ sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" }, "2025-11-11"),
    );
    const nov12 = earlier.ledger.groups[0].rows.find((r) => r.earnDate === "2025-11-12");
    expect(nov12?.notYetEarned).toBe(true);
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

  it("dates an extra Vacation row at the eligibility date (May 14, 2025), Approximate", () => {
    const extra = rows.filter((r) => r.origin === "extra" && r.benefitType === "vacation");
    expect(extra.map((r) => [r.key, r.earnDate, r.approximate])).toEqual([["vacation:extra:1", "2025-05-14", true]]);
  });

  it("shows an extra row from an earlier year as Carryover", () => {
    // As of Nov 24, 2026, SAP has 2026's ten and 2025's seven entries; 144 h is 18 days, one extra.
    const later = computeView(input({ sapVacationHours: 144, sapAsOf: "2026-11-24" }, "2026-11-24"));
    const extra = later.ledger.groups[0].rows.find((r) => r.origin === "extra");
    expect([extra?.key, extra?.earnDate, extra?.carryover]).toEqual(["vacation:extra:1", "2025-05-14", true]);
  });

  it("dates an extra Floating Holiday row Jan 1 of the as-of year", () => {
    const extra = rows.filter((r) => r.origin === "extra" && r.benefitType === "floatingHoliday");
    expect(extra.map((r) => [r.key, r.earnDate, r.approximate])).toEqual([
      ["fh:2025:extra:1", "2025-01-01", true],
    ]);
  });

  it("US-04: rounds balances down to whole days and ignores the hours left over", () => {
    const decimals = computeView(
      input({ sapVacationHours: 37.6, sapFloatingHolidayHours: 12.3, sapAsOf: "2025-11-24" }, "2025-11-24"),
    );
    expect(decimals.ledger.free).toEqual({ vacation: 4 + 10, floatingHoliday: 1 + 3 });
    expect(decimals.ledger).not.toHaveProperty("leftoverHours");
  });
});

describe("sapBalanceDays: what the app counts from an SAP balance", () => {
  it("counts whole 8-hour days and reports what's left over", () => {
    expect(sapBalanceDays(40)).toEqual({ days: 5, leftoverHours: 0 });
    expect(sapBalanceDays(43)).toEqual({ days: 5, leftoverHours: 3 });
    expect(sapBalanceDays(7.5)).toEqual({ days: 0, leftoverHours: 7.5 });
  });

  it("works in hundredths, so 37.6 h is 4 days and 5.6 h", () => {
    // 37.6 % 8 is 5.600000000000001 in floating point.
    expect(sapBalanceDays(37.6)).toEqual({ days: 4, leftoverHours: 5.6 });
  });
});

describe("a new hire's SAP Balance read before the eligibility date", () => {
  // Made-up hire date Oct 11, 2025: eligible Jul 11, 2026. By Apr 1, 2026 SAP has been
  // credited Dec 13, 2025 (paid Dec 18) and Mar 5, 2026 (paid Mar 12): 16 h.
  const newHire = (sapVacationHours: number, occasions: EngineInput["occasions"] = []) =>
    computeView({
      ...input({ hireDate: "2025-10-11", sapVacationHours, sapAsOf: "2026-04-01" }, "2026-04-01"),
      occasions,
    });
  const vacation2026 = (view: ReturnType<typeof computeView>) =>
    view.ledger.groups[0].rows.filter((r) => r.benefitType === "vacation");

  it("US-03: counts SAP's days once, by the date they were credited, each usable from Jul 11", () => {
    expect(vacation2026(newHire(16)).map((r) => [r.key, r.earnDate, r.origin])).toEqual([
      ["vacation:2026:1", "2026-07-11", "starting"],
      ["vacation:hire:1", "2026-07-11", "starting"],
      ["vacation:2026:2", "2026-07-11", "projected"],
      ["vacation:2026:3", "2026-07-11", "projected"],
      ["vacation:2026:4", "2026-09-10", "projected"],
      ["vacation:2026:5", "2026-11-12", "projected"],
    ]);
  });

  it("US-03: dates an extra walk-back row no earlier than the eligibility date", () => {
    const extra = vacation2026(newHire(24)).filter((r) => r.origin === "extra");
    expect(extra.map((r) => [r.key, r.earnDate])).toEqual([["vacation:extra:1", "2026-07-11"]]);
  });

  it("US-03: can't Burn Vacation before the eligibility date", () => {
    const april: Occasion = { id: "apr", name: "April", start: "2026-04-20", end: "2026-04-20", dayTypes: vacationOnWeekdays("2026-04-20", "2026-04-20") };
    const view = newHire(16, [april]);
    expect(view.occasions[0].short).toBe(1);
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
