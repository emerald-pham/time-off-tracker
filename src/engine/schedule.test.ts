import { describe, expect, it } from "vitest";
import { projectSchedule } from "./index";
import { sam } from "./fixtures";

const dates = (entries: { earnDate: string }[]) => entries.map((e) => e.earnDate);

describe("E1: Sam's projected schedule", () => {
  const schedule = projectSchedule(sam, 2027);
  const vacationEarnedIn = (year: number) =>
    schedule.filter((e) => e.benefitType === "vacation" && e.scheduleYear === year);

  it("hire-year Vacation unlocks 9 months after hire: 2 days dated May 14, 2025", () => {
    expect(vacationEarnedIn(2024).map((e) => [e.key, e.earnDate])).toEqual([
      ["vacation:hire:1", "2025-05-14"],
      ["vacation:hire:2", "2025-05-14"],
    ]);
  });

  it("2025 is the 1-week tier: Mar 5, May 7, Jul 9, Sep 10, Nov 12", () => {
    expect(vacationEarnedIn(2025).map((e) => [e.key, e.earnDate])).toEqual([
      ["vacation:2025:1", "2025-03-05"],
      ["vacation:2025:2", "2025-05-07"],
      ["vacation:2025:3", "2025-07-09"],
      ["vacation:2025:4", "2025-09-10"],
      ["vacation:2025:5", "2025-11-12"],
    ]);
  });

  const twoWeekDates = (y: number) =>
    ["02-01", "03-05", "04-05", "05-07", "06-07", "07-09", "08-09", "09-10", "10-11", "11-12"].map(
      (md) => `${y}-${md}`,
    );

  it("2026 is the 2-week tier: ten days from Feb 1 to Nov 12", () => {
    expect(dates(vacationEarnedIn(2026))).toEqual(twoWeekDates(2026));
    expect(vacationEarnedIn(2026).at(-1)?.key).toBe("vacation:2026:10");
  });

  it("2027 repeats 2026's dates", () => {
    expect(dates(vacationEarnedIn(2027))).toEqual(twoWeekDates(2027));
  });

  it("Floating Holidays: Sep 1 2024; Mar 1, Jun 1, Sep 1 2025; then Jan 1 x3", () => {
    const fh = schedule.filter((e) => e.benefitType === "floatingHoliday");
    expect(fh.map((e) => [e.key, e.earnDate])).toEqual([
      ["fh:2024:3", "2024-09-01"],
      ["fh:2025:1", "2025-03-01"],
      ["fh:2025:2", "2025-06-01"],
      ["fh:2025:3", "2025-09-01"],
      ["fh:2026:1", "2026-01-01"],
      ["fh:2026:2", "2026-01-01"],
      ["fh:2026:3", "2026-01-01"],
      ["fh:2027:1", "2027-01-01"],
      ["fh:2027:2", "2027-01-01"],
      ["fh:2027:3", "2027-01-01"],
    ]);
  });
});

describe("hire-year unlock in a shorter month", () => {
  it("May 31 + 9 months clamps to the month's last day (Feb 29 in a leap year)", () => {
    // Made-up hire date. Raw dates Aug 2, Oct 4 and Dec 6, 2023; the fourth falls in 2024.
    const schedule = projectSchedule({ ...sam, hireDate: "2023-05-31" }, 2023);
    expect(dates(schedule.filter((e) => e.benefitType === "vacation"))).toEqual([
      "2024-02-29",
      "2024-02-29",
      "2024-02-29",
    ]);
  });
});
