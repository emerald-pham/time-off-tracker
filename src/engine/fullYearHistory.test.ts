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

    it("rebuilds all of 2025's Vacation rows from the schedule", () => {
      expect(vacation2025(view).map((r) => r.earnDate)).toEqual([
        "2025-03-05",
        "2025-05-07",
        "2025-05-14",
        "2025-05-14",
        "2025-07-09",
        "2025-09-10",
        "2025-11-12",
      ]);
      expect(vacation2025(view).some((r) => r.estimated || r.carryover || r.usedNotListed)).toBe(false);
    });

    it("lets the Deducted Jun 10–11 Burn Mar 5 and May 7", () => {
      expect(view.occasions[0].days.every((d) => d.deducted)).toBe(true);
      expect(burnedBy(view, "june")).toEqual([
        ["vacation:2025:1", "2025-03-05"],
        ["vacation:2025:2", "2025-05-07"],
      ]);
      expect(view.ledger.usedNotListed.vacation).toBe(0);
    });
  });

  describe("with SAP 24 h, c = 3 + 2 − 7 = −2", () => {
    const view = computeView(input({ sapVacationHours: 24 }));

    it("marks Mar 5 and May 7 Used (not listed) and tells the user", () => {
      expect(vacation2025(view).filter((r) => r.usedNotListed).map((r) => r.key)).toEqual([
        "vacation:2025:1",
        "vacation:2025:2",
      ]);
      expect(view.ledger.usedNotListed.vacation).toBe(2);
    });

    it("lets Jun 10–11 Burn May 14 twice", () => {
      expect(burnedBy(view, "june")).toEqual([
        ["vacation:hire:1", "2025-05-14"],
        ["vacation:hire:2", "2025-05-14"],
      ]);
      expect(view.ledger.free.vacation).toBe(3 + 10);
    });
  });
});
