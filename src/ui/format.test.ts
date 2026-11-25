import { describe, expect, it } from "vitest";
import { formatEarnDate, freeSummary, leftoverNote, typeLabel } from "./format";

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
