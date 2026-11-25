import { describe, expect, it } from "vitest";
import { computeView } from "./index";
import type { DayType, EngineInput, IsoDate, Occasion, Settings } from "./index";
import { sam, vacationOnWeekdays } from "./fixtures";

/** E2's starting point: Sam as of Mon Nov 24, 2025, SAP Vacation 40 h, Floating Holiday 8 h. */
const e2: Partial<Settings> = { sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" };

/** An Occasion with Vacation chosen Monday to Friday and RDO at the weekend, plus `dayTypes`. */
function occasion(
  name: string,
  start: IsoDate,
  end: IsoDate = start,
  dayTypes: Record<IsoDate, DayType> = {},
): Occasion {
  return { id: name, name, start, end, dayTypes: vacationOnWeekdays(start, end, dayTypes) };
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
    expect(burnedBy(view, "Long weekend")).toEqual([["vacation:2025:1", "2025-05-14"]]);
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
    expect(burnedBy(view, "Visit")).toEqual([["vacation:2025:1", "2025-05-14"]]);
  });
});

describe("E4: oldest first", () => {
  const view = computeView(input([occasion("Ski week", "2026-02-24", "2026-02-26")]));
  const [ski] = view.occasions;

  it("with all three weekdays chosen as Vacation, PTO Days is 3", () => {
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
      ["vacation:2025:1", "2025-05-14"],
      ["vacation:2025:2", "2025-05-14"],
      ["vacation:2025:3", "2025-07-09"],
    ]);
    expect(ski.days.map((d) => d.burns)).toEqual(["vacation:2025:1", "vacation:2025:2", "vacation:2025:3"]);
    expect(view.ledger.free).toEqual({ vacation: 12, floatingHoliday: 4 });
  });
});

describe("E5: Floating Holidays stay in their year", () => {
  const holiday = occasion("New year", "2026-01-05", "2026-01-05", { "2026-01-05": "floatingHoliday" });

  it("a Floating Holiday Day Off on Mon Jan 5, 2026 Burns a Jan 1, 2026 one, not Sep 1, 2025", () => {
    const view = computeView(input([holiday]));
    expect(burnedBy(view, "New year")).toEqual([["fh:2026:1", "2026-01-01"]]);
    const sep1 = rows(view).find((r) => r.key === "fh:2025:3")!;
    expect([sep1.burnedBy, sep1.expiresWarning]).toEqual([null, true]);
  });

  it("after rollover, the Sep 1, 2025 Floating Holiday is Expired and hidden", () => {
    const view = computeView(input([holiday], e2, "2026-01-02"));
    expect(rows(view).some((r) => r.key === "fh:2025:3")).toBe(false);
    expect(view.ledger.free.floatingHoliday).toBe(5);
  });

  it("a Floating Holiday Day Off with none left in its year is Short, even with last year's free", () => {
    const view = computeView(
      input([occasion("Dec day", "2025-12-01", "2025-12-02", { "2025-12-01": "floatingHoliday", "2025-12-02": "floatingHoliday" })]),
    );
    expect(view.occasions[0].short).toBe(1);
    expect(view.occasions[0].days.map((d) => [d.burns, d.unmet])).toEqual([
      ["fh:2025:3", false],
      [null, true],
    ]);
  });
});

describe("E6: Short", () => {
  const view = computeView(input([occasion("Winter break", "2026-01-05", "2026-01-16")]));
  const [trip] = view.occasions;

  it("has 10 Vacation Days Off with Jan 10–11 as RDO", () => {
    expect(trip.ptoDays).toBe(10);
    expect(trip.days.filter((d) => d.dayType === "rdo").map((d) => d.date)).toEqual(["2026-01-10", "2026-01-11"]);
  });

  it("Burns E2's 5 rows and is short by 5; nothing is borrowed from the future", () => {
    expect(burnedBy(view, "Winter break").map(([, d]) => d)).toEqual([
      "2025-05-14",
      "2025-05-14",
      "2025-07-09",
      "2025-09-10",
      "2025-11-12",
    ]);
    expect(trip.short).toBe(5);
    expect(trip.days.filter((d) => d.unmet).map((d) => d.date)).toEqual([
      "2026-01-12",
      "2026-01-13",
      "2026-01-14",
      "2026-01-15",
      "2026-01-16",
    ]);
  });
});

describe("E7: Vacation Cap", () => {
  /** "Lee", made up: hired Mar 3, 2015, so 2026 is the 3-week tier and the cap is 240 h. */
  const lee: Partial<Settings> = {
    hireDate: "2015-03-03",
    sapVacationHours: 240,
    sapFloatingHolidayHours: 0,
    sapAsOf: "2026-01-10",
  };
  const jan22 = (view: ReturnType<typeof computeView>) => rows(view).find((r) => r.key === "vacation:2026:1")!;

  it("at the cap, the first 2026 projected day, Jan 22, is Lost to cap and not free", () => {
    const view = computeView(input([], lee, "2026-01-10"));
    expect([jan22(view).earnDate, jan22(view).lostToCap]).toEqual(["2026-01-22", true]);
    // 30 starting rows; Jan 22 lost; the second day (Feb 12) is earned at 240 h too, so lost as well.
    expect(rows(view).find((r) => r.key === "vacation:2026:2")!.lostToCap).toBe(true);
  });

  it("a Vacation Day Off on Mon Jan 5, 2026 (paid Jan 15) drops the balance to 232 h, so Jan 22 is earned", () => {
    const view = computeView(input([occasion("Day", "2026-01-05")], lee, "2026-01-10"));
    expect(view.occasions[0].days[0]).toMatchObject({ deducted: false, unmet: false });
    expect(jan22(view).lostToCap).toBe(false);
    // Jan 22 brings it back to 240 h, so Feb 12 is lost.
    expect(rows(view).find((r) => r.key === "vacation:2026:2")!.lostToCap).toBe(true);
  });

  it("rows Lost to cap are not free", () => {
    const view = computeView(input([], lee, "2026-01-10"));
    const lost = rows(view).filter((r) => r.lostToCap).length;
    const total = rows(view).filter((r) => r.benefitType === "vacation").length;
    expect(view.ledger.free.vacation).toBe(total - lost);
  });
});

describe("rollover with Burning", () => {
  it("last year's Vacation Burned by a Day Off this year was free on Jan 1, so it is Carryover", () => {
    const view = computeView(input([occasion("Jan day", "2026-01-05")], e2, "2026-01-02"));
    const top = view.ledger.groups[0].rows[0];
    expect([top.key, top.carryover, top.burnedBy?.occasionName]).toEqual(["vacation:2025:1", true, "Jan day"]);
  });

  it("last year's Vacation Burned by a Day Off last year is not Carryover", () => {
    // Fri Dec 26, 2025 is paid Jan 1, 2026, after the as-of date, so it still Burns.
    const view = computeView(input([occasion("Dec day", "2025-12-26")], e2, "2026-01-02"));
    const burned = rows(view).find((r) => r.burnedBy)!;
    expect([burned.key, burned.carryover]).toEqual(["vacation:2025:1", false]);
  });
});

describe("unpaid Days Off", () => {
  it("count separately from PTO Days and Burn nothing", () => {
    const view = computeView(
      input([occasion("Trip", "2026-02-24", "2026-02-26", { "2026-02-25": "unpaid" })]),
    );
    expect([view.occasions[0].ptoDays, view.occasions[0].unpaid]).toEqual([2, 1]);
    expect(burnedBy(view, "Trip")).toHaveLength(2);
  });
});

describe("Clash", () => {
  it("a date that two Occasions both mark as Vacation or Floating Holiday is a Clash", () => {
    const view = computeView(
      input([
        occasion("Beach", "2026-09-09", "2026-09-12"),
        occasion("Wedding", "2026-09-10", "2026-09-10", { "2026-09-10": "floatingHoliday" }),
      ]),
    );
    expect(view.clashes).toEqual([
      {
        date: "2026-09-10",
        entries: [
          { occasionId: "Beach", occasionName: "Beach", dayType: "vacation" },
          { occasionId: "Wedding", occasionName: "Wedding", dayType: "floatingHoliday" },
        ],
      },
    ]);
  });

  it("overlaps are otherwise allowed: RDO or Unpaid on a shared date is no Clash", () => {
    const view = computeView(
      input([
        occasion("Beach", "2026-09-09", "2026-09-12"),
        // Sep 12 is a Saturday (RDO in both); Sep 11 is Unpaid here.
        occasion("Visit", "2026-09-11", "2026-09-12", { "2026-09-11": "unpaid" }),
      ]),
    );
    expect(view.clashes).toEqual([]);
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

describe("approval status", () => {
  it("US-23: an Occasion not approved yet still Burns, and shows as not approved", () => {
    const view = computeView(input([occasion("Not approved", "2026-02-24", "2026-02-26")]));
    expect(view.occasions[0].approved).toBe(false);
    expect(burnedBy(view, "Not approved")).toHaveLength(3);
  });

  it("US-23: an approved Occasion shows as approved and Burns the same", () => {
    const view = computeView(input([{ ...occasion("Approved", "2026-02-24", "2026-02-26"), approved: true }]));
    expect(view.occasions[0].approved).toBe(true);
    expect(burnedBy(view, "Approved")).toHaveLength(3);
  });
});
