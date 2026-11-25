/**
 * Acceptance tests for "Setting up" in docs/user-stories.md (US-01 to US-05).
 * US-03 and US-04 are also covered next to the engine (src/engine/*.test.ts).
 */
import { describe, expect, it } from "vitest";
import { accrualTier, payday, projectSchedule } from "../../src/engine";
import { emptyAppData } from "../../src/storage";
import { floatingHolidayRows, lee, occasion, rowsOf, sam, samE2, vacationOccasion, vacationRows, view } from "./helpers";

describe("US-01: Start from my hire date and SAP balance", () => {
  // Sam enters a hire date and, on Mon Jun 1, 2026, reads 48 h Vacation and 16 h Floating Holiday in SAP.
  const settings = { ...sam, sapVacationHours: 48, sapFloatingHolidayHours: 16, sapAsOf: "2026-06-01" };
  const v = view(settings, "2026-06-01");
  const rows = rowsOf(v);
  const earnedNow = rows.filter((r) => !r.notYetEarned);

  it("US-01: fills in the Ledger from the hire date and the SAP Balance alone", () => {
    expect(v.configured).toBe(true);
    expect(v.ledger.groups.map((g) => g.year)).toEqual([2026, 2027]);
  });

  it("US-01: shows the Benefit Days I have now: one row per whole SAP day", () => {
    expect(vacationRows(earnedNow)).toHaveLength(6);
    expect(floatingHolidayRows(earnedNow)).toHaveLength(2);
  });

  it("US-01: gives each day I have now an estimated Earn Date, as if earned the normal way", () => {
    // The newest six entries of Sam's schedule that SAP holds by Jun 1, 2026.
    expect(vacationRows(earnedNow).map((r) => r.earnDate)).toEqual([
      "2025-09-10",
      "2025-11-12",
      "2026-02-01",
      "2026-03-05",
      "2026-04-05",
      "2026-05-07",
    ]);
    expect(earnedNow.every((r) => r.origin === "starting" && r.approximate)).toBe(true);
  });

  it("US-01: adds the days I'll earn for the rest of this year and next year", () => {
    const later = rows.filter((r) => r.notYetEarned);
    expect(vacationRows(later).map((r) => r.earnDate)).toEqual([
      ...["06-07", "07-09", "08-09", "09-10", "10-11", "11-12"].map((d) => `2026-${d}`),
      ...["02-01", "03-05", "04-05", "05-07", "06-07", "07-09", "08-09", "09-10", "10-11", "11-12"].map(
        (d) => `2027-${d}`,
      ),
    ]);
    expect(floatingHolidayRows(later).map((r) => r.earnDate)).toEqual(["2027-01-01", "2027-01-01", "2027-01-01"]);
    expect(later.every((r) => r.origin === "projected")).toBe(true);
  });

  it("US-01: dates days beyond what the schedule explains (overtime, say), too", () => {
    // 80 h is 10 days, but Sam's schedule only explains 7 by Nov 24, 2025.
    const more = view({ ...samE2, sapVacationHours: 80 }, "2025-11-24");
    const now = vacationRows(rowsOf(more)).filter((r) => !r.notYetEarned);
    expect(now).toHaveLength(10);
    expect(now.filter((r) => r.origin === "extra").map((r) => r.earnDate)).toEqual([
      "2025-05-14",
      "2025-05-14",
      "2025-05-14",
    ]);
    expect(now.every((r) => r.approximate)).toBe(true);
  });

  it("US-01: by default shows only what's available from the SAP Balance on", () => {
    expect(emptyAppData().settings.fullYearHistory).toBe(false);
    // 16 h of Vacation left: the five days used before tracking began don't appear.
    const twoLeft = view({ ...samE2, sapVacationHours: 16 }, "2025-11-24");
    expect(vacationRows(twoLeft.ledger.groups[0].rows).map((r) => r.earnDate)).toEqual(["2025-09-10", "2025-11-12"]);
  });

  it("US-01: shows the whole year when full-year history is turned on", () => {
    const history = view({ ...samE2, sapVacationHours: 16, fullYearHistory: true }, "2025-11-24");
    expect(vacationRows(history.ledger.groups[0].rows)).toHaveLength(7);
  });
});

describe("US-02: Project earning at 40 hours a week", () => {
  it("US-02: assumes 40 hours a week until I change it", () => {
    expect(emptyAppData().settings.weeklyHours).toBe(40);
  });

  it("US-02: projects Vacation from the hire date at 40 hours a week (spec E1)", () => {
    const credited = (year: number) =>
      projectSchedule(sam, 2027)
        .filter((e) => e.benefitType === "vacation" && e.scheduleYear === year)
        .map((e) => e.creditedDate.slice(5));
    expect(credited(2024)).toEqual(["10-16", "12-18"]);
    expect(credited(2025)).toEqual(["03-05", "05-07", "07-09", "09-10", "11-12"]);
    expect(credited(2026)).toEqual([
      "02-01", "03-05", "04-05", "05-07", "06-07", "07-09", "08-09", "09-10", "10-11", "11-12",
    ]);
  });

  it("US-02: raises the Accrual Tier in the years of the 2nd, 5th and 17th anniversaries", () => {
    const weeks = (year: number) => accrualTier(lee.hireDate!, year).weeks;
    // Lee was hired in 2015.
    expect([2015, 2016].map(weeks)).toEqual([1, 1]);
    expect([2017, 2019].map(weeks)).toEqual([2, 2]);
    expect([2020, 2031].map(weeks)).toEqual([3, 3]);
    expect([2032, 2040].map(weeks)).toEqual([4, 4]);
  });

  it("US-02: earns 5, 10, 15 and then 20 Vacation days a year at 40 hours a week", () => {
    const schedule = projectSchedule(lee, 2032);
    const days = (year: number) => schedule.filter((e) => e.benefitType === "vacation" && e.scheduleYear === year).length;
    expect([2016, 2017, 2020, 2032].map(days)).toEqual([5, 10, 15, 20]);
  });
});

describe("US-05: SAP lags until payday", () => {
  it("US-05: takes a Day Off out on the Thursday after its Sunday–Saturday Payroll Week", () => {
    expect(payday("2025-11-18")).toBe("2025-11-27");
    for (const d of ["2026-09-20", "2026-09-22", "2026-09-26"]) expect(payday(d)).toBe("2026-10-01");
    expect(payday("2026-09-27")).toBe("2026-10-08");
  });

  it("US-05: a Day Off whose paycheck hasn't come out still uses up a Benefit Day", () => {
    // SAP read Mon Nov 24, 2025; Tue Nov 18's paycheck comes out Thu Nov 27.
    const v = view(samE2, "2025-11-24", { occasions: [vacationOccasion("o1", "Made-up long weekend", "2025-11-18", "2025-11-18")] });
    const [day] = v.occasions[0].days;
    expect(day).toMatchObject({ deducted: false, unmet: false });
    expect(day.burns).not.toBeNull();
    expect(v.ledger.free.vacation).toBe(view(samE2, "2025-11-24").ledger.free.vacation - 1);
  });

  it("US-05: a Day Off already paid out is in the SAP Balance, so it uses nothing more", () => {
    // Tue Nov 11's paycheck came out Thu Nov 20, before SAP was read.
    const v = view(samE2, "2025-11-24", { occasions: [occasion("o1", "Made-up day out", "2025-11-11", "2025-11-11")] });
    expect(v.occasions[0].days[0]).toMatchObject({ deducted: true, burns: null });
    expect(v.occasions[0].deducted).toBe(true);
    expect(v.ledger.free).toEqual(view(samE2, "2025-11-24").ledger.free);
  });
});
