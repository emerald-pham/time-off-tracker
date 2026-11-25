import { describe, expect, it } from "vitest";
import {
  clashMessage,
  formatDayOff,
  formatRange,
  formatEarnDate,
  freeLine,
  sapBalanceNote,
  seasonLabel,
  typeLabel,
  usedNotListedMessage,
} from "./format";

describe("Used (not listed) message", () => {
  it("is null when nothing is Used (not listed)", () => {
    expect(usedNotListedMessage({ vacation: 0, floatingHoliday: 0 })).toBeNull();
  });

  it("tells the user how many days SAP shows used that no Day Off explains", () => {
    expect(usedNotListedMessage({ vacation: 2, floatingHoliday: 0 })).toBe(
      "SAP shows 2 Vacation days used that no listed Day Off explains. They're marked Used (not listed). Add the missing Days Off to fix this.",
    );
    expect(usedNotListedMessage({ vacation: 1, floatingHoliday: 1 })).toBe(
      "SAP shows 1 Vacation day and 1 Floating Holiday used that no listed Day Off explains. They're marked Used (not listed). Add the missing Days Off to fix this.",
    );
  });
});

describe("Occasion formatting", () => {
  it("shows Dates like 'Wed Sep 9 – Sat Sep 12', or one date alone", () => {
    expect(formatRange("2026-09-09", "2026-09-12")).toBe("Wed Sep 9 – Sat Sep 12");
    expect(formatRange("2026-09-09", "2026-09-09")).toBe("Wed Sep 9");
  });

  it("US-10: shows the year whenever it isn't the current year", () => {
    expect(formatRange("2026-09-09", "2026-09-12", 2026)).toBe("Wed Sep 9 – Sat Sep 12");
    expect(formatRange("2027-03-01", "2027-03-02", 2026)).toBe("Mon Mar 1 – Tue Mar 2, 2027");
    expect(formatRange("2027-03-01", "2027-03-01", 2026)).toBe("Mon Mar 1, 2027");
    expect(formatRange("2025-12-29", "2025-12-30", 2026)).toBe("Mon Dec 29 – Tue Dec 30, 2025");
    // Across New Year, each date not in the current year carries its own.
    expect(formatRange("2026-12-30", "2027-01-02", 2026)).toBe("Wed Dec 30 – Sat Jan 2, 2027");
    expect(formatRange("2027-12-30", "2028-01-02", 2026)).toBe("Thu Dec 30, 2027 – Sun Jan 2, 2028");
  });

  it("shows day editor dates like 'Tue, Nov 24th 2026'", () => {
    expect(formatDayOff("2026-11-24")).toBe("Tue, Nov 24th 2026");
    expect(formatDayOff("2026-11-01")).toBe("Sun, Nov 1st 2026");
    expect(formatDayOff("2026-11-02")).toBe("Mon, Nov 2nd 2026");
    expect(formatDayOff("2026-11-03")).toBe("Tue, Nov 3rd 2026");
    expect(formatDayOff("2026-11-11")).toBe("Wed, Nov 11th 2026");
    expect(formatDayOff("2026-11-12")).toBe("Thu, Nov 12th 2026");
    expect(formatDayOff("2026-11-13")).toBe("Fri, Nov 13th 2026");
    expect(formatDayOff("2026-11-21")).toBe("Sat, Nov 21st 2026");
    expect(formatDayOff("2026-11-22")).toBe("Sun, Nov 22nd 2026");
  });

  it("keeps the weekday right for a two-digit year (Jan 5, 0026 is a Monday)", () => {
    expect(formatRange("0026-01-05", "0026-01-05")).toBe("Mon Jan 5");
  });

  it("labels the Season like 'Winter 2026'", () => {
    expect(seasonLabel({ name: "Winter", year: 2026 })).toBe("Winter 2026");
  });

  it("explains a Clash from one Occasion's side, naming the other", () => {
    const clash = {
      date: "2026-09-10",
      entries: [
        { occasionId: "a", occasionName: "Beach", dayType: "vacation" as const },
        { occasionId: "b", occasionName: "Wedding", dayType: "floatingHoliday" as const },
      ],
    };
    expect(clashMessage(clash, "a")).toBe("Sep 10 is already Floating Holiday in 'Wedding'");
    expect(clashMessage(clash, "b")).toBe("Sep 10 is already Vacation in 'Beach'");
  });
});

describe("Ledger formatting", () => {
  it("shows Earn Dates like 'Mar 5', adding the year outside the year group", () => {
    expect(formatEarnDate("2026-03-05", 2026)).toBe("Mar 5");
    expect(formatEarnDate("2025-11-12", 2026)).toBe("Nov 12, 2025");
  });

  it("labels a Benefit Day Earned or Estimated, and Carryover 'Vacation (Previous Year)'", () => {
    const label = (benefitType: "vacation" | "floatingHoliday", carryover: boolean, notYetEarned: boolean) =>
      typeLabel({ benefitType, carryover, notYetEarned });
    expect(label("vacation", false, false)).toBe("Vacation (Earned)");
    expect(label("vacation", false, true)).toBe("Vacation (Estimated)");
    expect(label("floatingHoliday", false, false)).toBe("Floating Holiday (Earned)");
    expect(label("floatingHoliday", false, true)).toBe("Floating Holiday (Estimated)");
    expect(label("vacation", true, false)).toBe("Vacation (Previous Year)");
  });

  it("US-22: words free days earned now, or by the end of a year", () => {
    expect(freeLine("Earned now", { vacation: 5, floatingHoliday: 1 })).toBe(
      "Earned now: 5 Vacation, 1 Floating Holiday",
    );
    expect(freeLine("By end of 2027", { vacation: 20, floatingHoliday: 3 })).toBe(
      "By end of 2027: 20 Vacation, 3 Floating Holidays",
    );
  });

  it("says what an SAP balance counts as, with any hours left over", () => {
    expect(sapBalanceNote(40)).toBe("Counts as 5 days");
    expect(sapBalanceNote(43)).toBe("Counts as 5 days (3 hrs left over, less than a day)");
    expect(sapBalanceNote(8)).toBe("Counts as 1 day");
    expect(sapBalanceNote(37.6)).toBe("Counts as 4 days (5.6 hrs left over, less than a day)");
    expect(sapBalanceNote(1)).toBe("Counts as 0 days (1 hr left over, less than a day)");
  });
});
