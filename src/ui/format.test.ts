import { describe, expect, it } from "vitest";
import {
  clashMessage,
  formatDayOff,
  formatRange,
  formatEarnDate,
  freeSummary,
  leftoverNote,
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

  it("labels Carryover 'Vacation (Previous Year)'", () => {
    expect(typeLabel({ benefitType: "vacation", carryover: false })).toBe("Vacation");
    expect(typeLabel({ benefitType: "vacation", carryover: true })).toBe("Vacation (Previous Year)");
    expect(typeLabel({ benefitType: "floatingHoliday", carryover: false })).toBe("Floating Holiday");
  });

  it("summarizes free days like 'Free: 6 Vacation, 2 Floating Holidays'", () => {
    expect(freeSummary({ vacation: 6, floatingHoliday: 2 })).toBe("Free: 6 Vacation, 2 Floating Holidays");
    expect(freeSummary({ vacation: 15, floatingHoliday: 1 })).toBe("Free: 15 Vacation, 1 Floating Holiday");
  });

  it("notes leftover hours like '+4 hrs', and nothing when whole", () => {
    expect(leftoverNote(4)).toBe("+4 hrs");
    expect(leftoverNote(0)).toBeNull();
  });
});
