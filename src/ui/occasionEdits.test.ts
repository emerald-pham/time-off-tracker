import { describe, expect, it } from "vitest";
import type { Occasion } from "../engine";
import { sam, vacationOnWeekdays } from "../engine/fixtures";
import { emptyAppData } from "../storage";
import { checkOccasion, withRange } from "./occasionEdits";

/** Wed Sep 9 – Sat Sep 12, 2026, chosen as Vacation Wednesday to Friday. */
const beach: Occasion = {
  id: "b",
  name: "Beach",
  start: "2026-09-09",
  end: "2026-09-12",
  dayTypes: vacationOnWeekdays("2026-09-09", "2026-09-12"),
};
const data = { ...emptyAppData(), settings: sam, occasions: [beach] };
const today = "2026-08-01";

describe("US-25: changing an Occasion's range", () => {
  it("US-25: recomputes the whole new range when the Day Types were the weekly rule's", () => {
    const o: Occasion = {
      ...beach,
      dayTypes: { "2026-09-09": "rdo", "2026-09-10": "rdo", "2026-09-11": "vacation", "2026-09-12": "vacation" },
    };
    // Wed Sep 9 – Tue Sep 15 now crosses the break: Wed–Sat RDOs first, Sun–Tue RDOs last.
    expect(withRange(o, "2026-09-09", "2026-09-15").dayTypes).toEqual({
      "2026-09-09": "rdo",
      "2026-09-10": "rdo",
      "2026-09-11": "vacation",
      "2026-09-12": "vacation",
      "2026-09-13": "vacation",
      "2026-09-14": "rdo",
      "2026-09-15": "rdo",
    });
  });

  it("US-25: treats a range never customized (no stored types) as the rule's too", () => {
    const o: Occasion = { ...beach, dayTypes: {} };
    expect(withRange(o, "2026-09-10", "2026-09-11").dayTypes).toEqual({ "2026-09-10": "rdo", "2026-09-11": "rdo" });
  });

  it("US-25: a refilled range gets only the days off another Occasion hasn't taken that week", () => {
    const o: Occasion = { ...beach, dayTypes: {} };
    // Another Occasion holds Fri Sep 11 and Sat Sep 12 as RDO: the week's two days off are gone.
    expect(withRange(o, "2026-09-08", "2026-09-09", ["2026-09-11", "2026-09-12"]).dayTypes).toEqual({
      "2026-09-08": "vacation",
      "2026-09-09": "vacation",
    });
    // One left: Tue–Wed within one week takes it first.
    expect(withRange(o, "2026-09-08", "2026-09-09", ["2026-09-12"]).dayTypes).toEqual({
      "2026-09-08": "rdo",
      "2026-09-09": "vacation",
    });
  });

  it("US-25: keeps customized types for dates still in range, and gives added dates the rule's type over the new range", () => {
    const o: Occasion = {
      ...beach,
      dayTypes: { "2026-09-09": "unpaid", "2026-09-10": "floatingHoliday", "2026-09-11": "vacation", "2026-09-12": "vacation" },
    };
    // Thu Sep 10 – Mon Sep 14: Sun Sep 13 and Mon Sep 14 continue from the week before, so both are RDO.
    expect(withRange(o, "2026-09-10", "2026-09-14").dayTypes).toEqual({
      "2026-09-10": "floatingHoliday",
      "2026-09-11": "vacation",
      "2026-09-12": "vacation",
      "2026-09-13": "rdo",
      "2026-09-14": "rdo",
    });
  });
});

describe("US-25: a changed range keeps each week to two days off", () => {
  // Wed Sep 9 – Sat Sep 12, 2026, customized: RDO, RDO, Floating Holiday, Vacation.
  const custom: Occasion = {
    ...beach,
    dayTypes: { "2026-09-09": "rdo", "2026-09-10": "rdo", "2026-09-11": "floatingHoliday", "2026-09-12": "vacation" },
  };

  it("US-25: added dates the rule makes RDO become Vacation when the kept days already use the week's two", () => {
    // Mon Sep 7 – Sat Sep 12: the rule would make Mon and Tue RDO, but Wed and Thu are already.
    expect(withRange(custom, "2026-09-07", "2026-09-12").dayTypes).toEqual({
      "2026-09-07": "vacation",
      "2026-09-08": "vacation",
      "2026-09-09": "rdo",
      "2026-09-10": "rdo",
      "2026-09-11": "floatingHoliday",
      "2026-09-12": "vacation",
    });
  });

  it("US-25: the person's kept choices win, and only what's left of the week goes to added dates", () => {
    const oneRdo: Occasion = { ...custom, dayTypes: { ...custom.dayTypes, "2026-09-10": "unpaid" } };
    expect(withRange(oneRdo, "2026-09-07", "2026-09-12").dayTypes).toEqual({
      "2026-09-07": "rdo",
      "2026-09-08": "vacation",
      "2026-09-09": "rdo",
      "2026-09-10": "unpaid",
      "2026-09-11": "floatingHoliday",
      "2026-09-12": "vacation",
    });
    // With another Occasion holding Sun Sep 6, nothing is left for the added dates.
    expect(withRange(oneRdo, "2026-09-07", "2026-09-12", ["2026-09-06"]).dayTypes).toMatchObject({
      "2026-09-07": "vacation",
      "2026-09-08": "vacation",
    });
  });
});

describe("checking an Occasion before saving", () => {
  it("resolves defaults for a new Occasion and finds no Clash when there is none", () => {
    const trip: Occasion = { id: "t", name: "Trip", start: "2026-10-02", end: "2026-10-03", dayTypes: {} };
    const check = checkOccasion(data, today, trip);
    expect(check.clashes).toEqual([]);
    expect(check.view.days.map((d) => d.dayType)).toEqual(["rdo", "rdo"]);
  });

  it("refuses a Clash with a message naming the other Occasion, and lists the clashing dates", () => {
    const wedding: Occasion = {
      id: "w",
      name: "Wedding",
      start: "2026-09-10",
      end: "2026-09-11",
      dayTypes: vacationOnWeekdays("2026-09-10", "2026-09-11"),
    };
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
