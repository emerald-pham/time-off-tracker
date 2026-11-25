import { describe, expect, it } from "vitest";
import { computeView } from "./index";
import type { EngineInput, Occasion, Settings, ViewModel } from "./index";
import { sam } from "./fixtures";

/** E8's Occasion: Tue Jun 10 – Wed Jun 11, 2025, both Vacation and Deducted by Nov 24, 2025. */
const june: Occasion = { id: "june", name: "June trip", start: "2025-06-10", end: "2025-06-11", dayTypes: {} };

function input(settings: Partial<Settings>, occasions: Occasion[] = [june]): EngineInput {
  return {
    settings: { ...sam, fullYearHistory: true, sapAsOf: "2025-11-24", ...settings },
    occasions,
    earnDateEdits: {},
    today: "2025-11-24",
  };
}

const rows = (view: ViewModel) => view.ledger.groups.flatMap((g) => g.rows);
const vacation2025 = (view: ViewModel) =>
  view.ledger.groups[0].rows.filter((r) => r.benefitType === "vacation");
const burnedBy = (view: ViewModel, id: string) =>
  rows(view)
    .filter((r) => r.burnedBy?.occasionId === id)
    .map((r) => [r.key, r.earnDate]);

describe("E8: full-year history mode", () => {
  describe("with SAP 40 h, c = 5 + 2 − 7 = 0", () => {
    const view = computeView(input({ sapVacationHours: 40 }));

    it("rebuilds all of 2025's Vacation rows from the schedule, four unlocking on May 14", () => {
      expect(vacation2025(view).map((r) => r.earnDate)).toEqual([
        "2025-05-14",
        "2025-05-14",
        "2025-05-14",
        "2025-05-14",
        "2025-07-09",
        "2025-09-10",
        "2025-11-12",
      ]);
      expect(vacation2025(view).some((r) => r.approximate || r.carryover || r.usedNotListed)).toBe(false);
    });

    it("lets the Deducted Jun 10–11 Burn two of the May 14 rows", () => {
      expect(view.occasions[0].days.every((d) => d.deducted)).toBe(true);
      expect(burnedBy(view, "june")).toEqual([
        ["vacation:2025:1", "2025-05-14"],
        ["vacation:2025:2", "2025-05-14"],
      ]);
      expect(view.ledger.usedNotListed.vacation).toBe(0);
    });
  });

  describe("with SAP 24 h, c = 3 + 2 − 7 = −2", () => {
    const view = computeView(input({ sapVacationHours: 24 }));

    it("lets the Deducted Jun 10–11 Burn first: two of the May 14 rows", () => {
      expect(burnedBy(view, "june")).toEqual([
        ["vacation:2025:1", "2025-05-14"],
        ["vacation:2025:2", "2025-05-14"],
      ]);
      expect(view.occasions[0].short).toBe(0);
    });

    it("then marks the oldest rows still free, the other two May 14, Used (not listed) and tells the user", () => {
      expect(vacation2025(view).filter((r) => r.usedNotListed).map((r) => r.key)).toEqual([
        "vacation:hire:1",
        "vacation:hire:2",
      ]);
      expect(view.ledger.usedNotListed.vacation).toBe(2);
      expect(view.ledger.free.vacation).toBe(3 + 10);
    });
  });

  describe("an early Deducted Day Off isn't left unmet by Used (not listed)", () => {
    // Mon Jun 2, 2025, Deducted. SAP 8 h: c = 1 + 1 − 7 = −5. Only the four May 14 rows are
    // earned by Jun 2, so marking five Used (not listed) first would leave it unmet.
    const june2: Occasion = { id: "june2", name: "June day", start: "2025-06-02", end: "2025-06-02", dayTypes: {} };
    const view = computeView(input({ sapVacationHours: 8 }, [june2]));

    it("Burns a May 14 row, then marks the next five oldest Used (not listed)", () => {
      expect(burnedBy(view, "june2")).toEqual([["vacation:2025:1", "2025-05-14"]]);
      expect(view.occasions[0].short).toBe(0);
      expect(vacation2025(view).filter((r) => r.usedNotListed).map((r) => r.key)).toEqual([
        "vacation:2025:2",
        "vacation:hire:1",
        "vacation:hire:2",
        "vacation:2025:3",
        "vacation:2025:4",
      ]);
    });

    it("leaves SAP's 1 day free, plus 2026's 10", () => {
      expect(view.ledger.free.vacation).toBe(1 + 10);
    });
  });
});

describe("full-year history: Carryover from the SAP Balance", () => {
  // Sam as of Nov 24, 2026: all ten 2026 Vacation entries are in SAP. SAP 96 h, so c = 12 + 0 − 10 = 2.
  const view = computeView({
    ...input({ sapVacationHours: 96, sapAsOf: "2026-11-24" }, []),
    today: "2026-11-24",
  });

  it("adds two Carryover rows by walking back 2025's entries, newest first, at the top", () => {
    const top = view.ledger.groups[0].rows.slice(0, 3);
    expect(top.map((r) => [r.key, r.earnDate, r.carryover, r.approximate])).toEqual([
      ["vacation:2025:4", "2025-09-10", true, true],
      ["vacation:2025:5", "2025-11-12", true, true],
      ["fh:2026:1", "2026-01-01", false, false],
    ]);
    // 12 this year, then 2027 reaches the 160 h cap after 8 more: the last 2 are Lost to cap.
    expect(view.ledger.free.vacation).toBe(12 + 8);
  });

  it("dates Carryover at the eligibility date once earlier entries run out", () => {
    // As of Nov 24, 2026, 2025's seven entries are the earlier ones. SAP 152 h: c = 19 − 10 = 9.
    const v = computeView({ ...input({ sapVacationHours: 152, sapAsOf: "2026-11-24" }, []), today: "2026-11-24" });
    const extra = rows(v).filter((r) => r.origin === "extra" && r.benefitType === "vacation");
    expect(extra.map((r) => [r.key, r.earnDate, r.carryover])).toEqual([
      ["vacation:extra:1", "2025-05-14", true],
      ["vacation:extra:2", "2025-05-14", true],
    ]);
  });
});

describe("full-year history: Floating Holidays", () => {
  const floating: Occasion = {
    id: "fourth",
    name: "Long weekend",
    start: "2025-07-07",
    end: "2025-07-07",
    dayTypes: { "2025-07-07": "floatingHoliday" },
  };
  const fh2025 = (view: ViewModel) =>
    view.ledger.groups[0].rows.filter((r) => r.benefitType === "floatingHoliday");

  it("with SAP 8 h and one Deducted Floating Holiday Day Off, c = 1 + 1 − 3 = −1", () => {
    // SAP Vacation 56 h matches 2025's seven Vacation entries, so no Vacation is Used (not listed).
    // Jul 7 Burns the oldest, Mar 1; then the oldest still free, Jun 1, is Used (not listed).
    const view = computeView(input({ sapVacationHours: 56, sapFloatingHolidayHours: 8 }, [floating]));
    expect(fh2025(view).map((r) => [r.earnDate, r.usedNotListed, r.burnedBy?.occasionName ?? null])).toEqual([
      ["2025-03-01", false, "Long weekend"],
      ["2025-06-01", true, null],
      ["2025-09-01", false, null],
    ]);
    expect(view.ledger.usedNotListed).toEqual({ vacation: 0, floatingHoliday: 1 });
  });

  it("with SAP 32 h, c = 4 − 3 = 1: an extra row dated Jan 1, Approximate", () => {
    const view = computeView(input({ sapFloatingHolidayHours: 32 }, []));
    expect(fh2025(view).map((r) => [r.key, r.earnDate, r.approximate])).toEqual([
      ["fh:2025:extra:1", "2025-01-01", true],
      ["fh:2025:1", "2025-03-01", false],
      ["fh:2025:2", "2025-06-01", false],
      ["fh:2025:3", "2025-09-01", false],
    ]);
  });
});

describe("full-year history off (the default)", () => {
  it("leaves E8's Deducted Days Off as history that Burns nothing", () => {
    const view = computeView(input({ fullYearHistory: false, sapVacationHours: 40 }));
    expect(burnedBy(view, "june")).toEqual([]);
    expect(view.ledger.usedNotListed).toEqual({ vacation: 0, floatingHoliday: 0 });
  });
});
