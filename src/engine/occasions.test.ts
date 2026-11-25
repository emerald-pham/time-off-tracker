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

const rows = (view: ReturnType<typeof computeView>) => view.ledger.groups.flatMap((g) => g.rows);
const burnedBy = (view: ReturnType<typeof computeView>, name: string) =>
  rows(view)
    .filter((r) => r.burnedBy?.occasionName === name)
    .map((r) => [r.key, r.earnDate]);

describe("E4: oldest first", () => {
  const view = computeView(input([occasion("Ski week", "2026-02-24", "2026-02-26")]));
  const [ski] = view.occasions;

  it("defaults all three weekdays to Vacation, so PTO Days is 3", () => {
    expect(ski.days.map((d) => [d.date, d.dayType])).toEqual([
      ["2026-02-24", "vacation"],
      ["2026-02-25", "vacation"],
      ["2026-02-26", "vacation"],
    ]);
    expect(ski.ptoDays).toBe(3);
    expect(ski.short).toBe(0);
  });

  it("Burns May 14 2025, May 14 2025 and Jul 9 2025", () => {
    expect(burnedBy(view, "Ski week")).toEqual([
      ["vacation:hire:1", "2025-05-14"],
      ["vacation:hire:2", "2025-05-14"],
      ["vacation:2025:3", "2025-07-09"],
    ]);
    expect(ski.days.map((d) => d.burns)).toEqual(["vacation:hire:1", "vacation:hire:2", "vacation:2025:3"]);
    expect(view.ledger.free).toEqual({ vacation: 12, floatingHoliday: 4 });
  });
});

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
