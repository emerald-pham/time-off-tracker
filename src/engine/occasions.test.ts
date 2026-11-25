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

describe("E3: paydays decide what is Deducted", () => {
  it("a Day Off on Tue Nov 18, 2025 is paid Nov 27, after E2's as-of date, so it Burns", () => {
    const view = computeView(input([occasion("Long weekend", "2025-11-18")]));
    expect(view.occasions[0].days).toMatchObject([{ date: "2025-11-18", deducted: false }]);
    expect(burnedBy(view, "Long weekend")).toEqual([["vacation:hire:1", "2025-05-14"]]);
    expect(view.occasions[0].deducted).toBe(false);
  });

  it("a Day Off paid on or before the as-of date is history: greyed, Burns nothing", () => {
    // Mon Nov 10, 2025 is paid Thu Nov 20, before Nov 24.
    const view = computeView(input([occasion("Errands", "2025-11-10")]));
    expect(view.occasions[0].days).toMatchObject([
      { date: "2025-11-10", dayType: "vacation", deducted: true, burns: null, unmet: false },
    ]);
    expect(view.occasions[0].deducted).toBe(true);
    expect(view.occasions[0].short).toBe(0);
    expect(burnedBy(view, "Errands")).toEqual([]);
  });

  it("an Occasion only partly Deducted is not greyed as a whole", () => {
    // Fri Nov 14 and Sat Nov 15 are paid Nov 20 (Deducted); Sun Nov 16 starts a new Payroll Week.
    const view = computeView(input([occasion("Visit", "2025-11-14", "2025-11-17")]));
    expect(view.occasions[0].days.map((d) => d.deducted)).toEqual([true, true, false, false]);
    expect(view.occasions[0].deducted).toBe(false);
    expect(burnedBy(view, "Visit")).toEqual([["vacation:hire:1", "2025-05-14"]]);
  });
});

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
