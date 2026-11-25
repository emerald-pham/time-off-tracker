import { describe, expect, it } from "vitest";
import type { Occasion } from "../engine";
import { sam } from "../engine/fixtures";
import { emptyAppData } from "../storage";
import { checkOccasion, withRange } from "./occasionEdits";

const beach: Occasion = { id: "b", name: "Beach", start: "2026-09-09", end: "2026-09-12", dayTypes: {} };
const data = { ...emptyAppData(), settings: sam, occasions: [beach] };
const today = "2026-08-01";

describe("changing an Occasion's range", () => {
  it("keeps the type of dates still in range and drops the rest, so added dates get defaults", () => {
    const o: Occasion = {
      ...beach,
      dayTypes: { "2026-09-09": "unpaid", "2026-09-10": "floatingHoliday", "2026-09-11": "vacation" },
    };
    expect(withRange(o, "2026-09-10", "2026-09-14").dayTypes).toEqual({
      "2026-09-10": "floatingHoliday",
      "2026-09-11": "vacation",
    });
  });
});

describe("checking an Occasion before saving", () => {
  it("resolves defaults for a new Occasion and finds no Clash when there is none", () => {
    const trip: Occasion = { id: "t", name: "Trip", start: "2026-10-02", end: "2026-10-03", dayTypes: {} };
    const check = checkOccasion(data, today, trip);
    expect(check.clashes).toEqual([]);
    expect(check.view.days.map((d) => d.dayType)).toEqual(["vacation", "rdo"]);
  });

  it("refuses a Clash with a message naming the other Occasion, and lists the clashing dates", () => {
    const wedding: Occasion = { id: "w", name: "Wedding", start: "2026-09-10", end: "2026-09-11", dayTypes: {} };
    const check = checkOccasion(data, today, wedding);
    expect(check.clashes.map((c) => c.date)).toEqual(["2026-09-10", "2026-09-11"]);
    expect(check.messages).toEqual([
      "Sep 10 is already Vacation in 'Beach'",
      "Sep 11 is already Vacation in 'Beach'",
    ]);
  });

  it("checks an edited Occasion against the others, not its saved self", () => {
    const edited = withRange(beach, "2026-09-08", "2026-09-12");
    expect(checkOccasion(data, today, edited).clashes).toEqual([]);
  });
});
