import { describe, expect, it } from "vitest";
import { computeView } from "./index";
import type { DayType, EngineInput, IsoDate, Occasion, Settings } from "./index";
import { sam } from "./fixtures";

/** E2's starting point: Sam as of Mon Nov 24, 2025, SAP Vacation 40 h, Floating Holiday 8 h. */
const e2: Partial<Settings> = { sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" };

function occasion(
  name: string,
  start: IsoDate,
  end: IsoDate = start,
  dayTypes: Record<IsoDate, DayType> = {},
): Occasion {
  return { id: name, name, start, end, dayTypes };
}

function input(occasions: Occasion[], settings: Partial<Settings> = e2, today = "2025-11-24"): EngineInput {
  return { settings: { ...sam, ...settings }, occasions, earnDateEdits: {}, today };
}

describe("Season: worked out from the start date", () => {
  it.each([
    ["2026-09-09", "Autumn", 2026],
    ["2026-11-06", "Winter", 2026],
    ["2027-01-15", "Winter", 2026],
    ["2027-02-24", "Spring", 2027],
    ["2027-05-01", "Summer", 2027],
  ])("%s is %s %i", (start, name, year) => {
    const view = computeView(input([occasion("Trip", start)]));
    expect(view.occasions[0].season).toEqual({ name, year });
  });
});
