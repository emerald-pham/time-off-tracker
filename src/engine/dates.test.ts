import { describe, expect, it } from "vitest";
import { addDays, addMonthsClamped, isoDate, weekdayOf } from "./dates";
import { isSupportedDate } from "./index";

describe("calendar dates keep years 0–99 as written", () => {
  // Date.UTC treats years 0–99 as 1900–1999; these must not jump a century.
  it("builds and steps dates in year 26", () => {
    expect(isoDate(26, 1, 5)).toBe("0026-01-05");
    expect(addDays("0026-01-05", 1)).toBe("0026-01-06");
    expect(addMonthsClamped("0025-05-31", 9)).toBe("0026-02-28");
  });

  it("finds the weekday in year 26 (Jan 5, 0026 is a Monday; Jan 5, 1926 was a Tuesday)", () => {
    expect(weekdayOf("0026-01-05")).toBe(1);
  });
});

describe("isSupportedDate: what the app saves", () => {
  it.each(["2026-11-24", "1950-01-01", "2100-12-31", "2028-02-29"])("accepts %s", (d) => {
    expect(isSupportedDate(d)).toBe(true);
  });

  it.each(["1949-12-31", "2101-01-01", "0026-01-05", "2026-02-30", "2027-02-29", "2026-1-5", "", "soon"])(
    "rejects %j",
    (d) => {
      expect(isSupportedDate(d)).toBe(false);
    },
  );

  it("rejects anything that isn't a string", () => {
    expect(isSupportedDate(null)).toBe(false);
    expect(isSupportedDate(20261124)).toBe(false);
  });
});
