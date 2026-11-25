/**
 * Acceptance tests for "Planning Occasions" in docs/user-stories.md (US-06 to
 * US-09), against the engine and the pure helpers the Occasions panel uses.
 * Occasion names are made up.
 */
import { describe, expect, it } from "vitest";
import type { Occasion } from "../../src/engine";
import type { AppData } from "../../src/storage";
import { DAY_TYPE_LABELS, formatDayOff, formatRange, seasonLabel } from "../../src/ui/format";
import { checkOccasion, withResolvedTypes } from "../../src/ui/occasionEdits";
import { occasion, samE2, vacationOccasion, view } from "./helpers";

const today = "2025-11-24";
const data = (...occasions: Occasion[]): AppData => ({ settings: samE2, occasions, earnDateEdits: {} });

describe("US-06: Add an Occasion with a name and dates", () => {
  // Tue Feb 24 – Thu Feb 26, 2026, all three chosen as Vacation.
  const ski = vacationOccasion("ski", "Made-up ski week", "2026-02-24", "2026-02-26");
  const v = view(samE2, today, { occasions: [ski] });

  it("US-06: keeps the Occasion's name, start date and end date", () => {
    expect(v.occasions[0]).toMatchObject({ id: "ski", name: "Made-up ski week", start: "2026-02-24", end: "2026-02-26" });
    expect(formatRange(ski.start, ski.end)).toBe("Tue Feb 24 – Thu Feb 26");
  });

  it("US-06: shows its PTO Days and Season", () => {
    expect(v.occasions[0].ptoDays).toBe(3);
    expect(seasonLabel(v.occasions[0].season)).toBe("Spring 2026");
  });

  it("US-06: works out the Season from the start date, January belonging to the Winter before", () => {
    const seasonOf = (start: string) =>
      seasonLabel(view(samE2, today, { occasions: [occasion("o", "Made-up", start, start)] }).occasions[0].season);
    expect(seasonOf("2026-09-09")).toBe("Autumn 2026");
    expect(seasonOf("2026-11-06")).toBe("Winter 2026");
    expect(seasonOf("2027-01-15")).toBe("Winter 2026");
    expect(seasonOf("2027-02-24")).toBe("Spring 2027");
    expect(seasonOf("2027-06-30")).toBe("Summer 2027");
  });

  it("US-06: lists Occasions by start date", () => {
    const later = occasion("later", "Made-up road trip", "2026-07-13", "2026-07-14");
    const earlier = occasion("earlier", "Made-up long weekend", "2026-01-09", "2026-01-12");
    const names = view(samE2, today, { occasions: [later, earlier] }).occasions.map((o) => o.name);
    expect(names).toEqual(["Made-up long weekend", "Made-up road trip"]);
  });
});

describe("US-07: Choose each day's type", () => {
  // Fri Jan 9 – Mon Jan 12, 2026: it crosses one week break.
  const weekend = occasion("wknd", "Made-up long weekend", "2026-01-09", "2026-01-12");

  it("US-07: writes each day like 'Tue, Nov 24th 2026'", () => {
    expect(formatDayOff("2026-11-24")).toBe("Tue, Nov 24th 2026");
    expect(formatDayOff("2026-01-01")).toBe("Thu, Jan 1st 2026");
    expect(formatDayOff("2026-01-12")).toBe("Mon, Jan 12th 2026");
    expect(formatDayOff("2026-01-22")).toBe("Thu, Jan 22nd 2026");
  });

  it("US-07: has one row per day once the dates are in", () => {
    const { view: o } = checkOccasion(data(), today, weekend);
    expect(o.days.map((d) => formatDayOff(d.date))).toEqual([
      "Fri, Jan 9th 2026",
      "Sat, Jan 10th 2026",
      "Sun, Jan 11th 2026",
      "Mon, Jan 12th 2026",
    ]);
  });

  it("US-07: offers RDO, Floating Holiday, Vacation or Unpaid for each day", () => {
    expect(Object.values(DAY_TYPE_LABELS)).toEqual(["RDO", "Floating Holiday", "Vacation", "Unpaid"]);
  });

  it("US-07: gives new days their defaults from the weekly rule (US-25)", () => {
    // Fri–Sat continue into the next week and Sun–Mon continue from it: 2 RDOs each.
    const { view: o } = checkOccasion(data(), today, weekend);
    expect(o.days.map((d) => d.dayType)).toEqual(["rdo", "rdo", "rdo", "rdo"]);
  });

  it("US-07: Save stores the choices", () => {
    const chosen = { ...weekend, dayTypes: { "2026-01-09": "floatingHoliday" as const, "2026-01-12": "vacation" as const } };
    const saved = withResolvedTypes(chosen, checkOccasion(data(), today, chosen).view);
    expect(saved.dayTypes).toEqual({
      "2026-01-09": "floatingHoliday",
      "2026-01-10": "rdo",
      "2026-01-11": "rdo",
      "2026-01-12": "vacation",
    });
    // Stored, so the defaults don't move them.
    const v = view(samE2, today, { occasions: [saved] });
    expect(v.occasions[0].days.map((d) => d.dayType)).toEqual(["floatingHoliday", "rdo", "rdo", "vacation"]);
  });
});

describe("US-08: PTO Days counts only paid time off", () => {
  // Fri Jan 9 – Tue Jan 13, 2026: Floating Holiday, two RDOs, Vacation, Unpaid.
  const mixed = vacationOccasion("mixed", "Made-up family visit", "2026-01-09", "2026-01-13", {
    "2026-01-09": "floatingHoliday",
    "2026-01-13": "unpaid",
  });
  const [o] = view(samE2, today, { occasions: [mixed] }).occasions;

  it("US-08: counts Floating Holiday and Vacation days, not RDO days", () => {
    expect(o.days.map((d) => d.dayType)).toEqual(["floatingHoliday", "rdo", "rdo", "vacation", "unpaid"]);
    expect(o.ptoDays).toBe(2);
  });

  it("US-08: counts Unpaid days separately", () => {
    expect(o.unpaid).toBe(1);
  });
});

describe("US-09: Overlapping Occasions are fine unless paid time clashes", () => {
  // Mon Jan 12 – Fri Jan 16, 2026, all chosen as Vacation.
  const ski = vacationOccasion("ski", "Made-up ski week", "2026-01-12", "2026-01-16");

  it("US-09: lets two Occasions share a date that's Unpaid in one of them", () => {
    const visit = occasion("visit", "Made-up family visit", "2026-01-12", "2026-01-12", { "2026-01-12": "unpaid" });
    const check = checkOccasion(data(ski), today, visit);
    expect(check.clashes).toEqual([]);
    expect(check.messages).toEqual([]);
  });

  it("US-09: lets two Occasions share RDO days", () => {
    const a = occasion("a", "Made-up weekend away", "2026-01-10", "2026-01-11");
    const b = occasion("b", "Made-up concert", "2026-01-10", "2026-01-10");
    expect(checkOccasion(data(a), today, b).clashes).toEqual([]);
  });

  it("US-09: refuses a date that's Vacation in both, naming the other Occasion", () => {
    const visit = vacationOccasion("visit", "Made-up family visit", "2026-01-12", "2026-01-13");
    const check = checkOccasion(data(ski), today, visit);
    expect(check.clashes.map((c) => c.date)).toEqual(["2026-01-12", "2026-01-13"]);
    expect(check.messages).toEqual([
      "Jan 12 is already Vacation in 'Made-up ski week'",
      "Jan 13 is already Vacation in 'Made-up ski week'",
    ]);
  });

  it("US-09: counts Vacation in one and Floating Holiday in the other as a Clash too", () => {
    const fh = occasion("fh", "Made-up day out", "2026-01-12", "2026-01-12", { "2026-01-12": "floatingHoliday" });
    expect(checkOccasion(data(ski), today, fh).messages).toEqual(["Jan 12 is already Vacation in 'Made-up ski week'"]);
    expect(checkOccasion(data(fh), today, ski).messages).toEqual([
      "Jan 12 is already Floating Holiday in 'Made-up day out'",
    ]);
  });
});

describe("US-25: Fill in Day Types automatically, week by week", () => {
  const newOccasion = (start: string, end: string) =>
    view(samE2, today, { occasions: [occasion("o", "Made-up trip", start, end)] }).occasions[0];

  it("US-25: Wed Feb 24 – Tue Mar 2, 2027 is RDO, RDO, Vac, Vac, Vac, RDO, RDO: 3 PTO Days", () => {
    const o = newOccasion("2027-02-24", "2027-03-02");
    expect(o.days.map((d) => d.dayType)).toEqual(["rdo", "rdo", "vacation", "vacation", "vacation", "rdo", "rdo"]);
    expect(o.ptoDays).toBe(3);
  });

  it("US-25: Wed–Sat within one week puts the RDOs first: 2 PTO Days", () => {
    const o = newOccasion("2026-09-09", "2026-09-12");
    expect(o.days.map((d) => d.dayType)).toEqual(["rdo", "rdo", "vacation", "vacation"]);
    expect(o.ptoDays).toBe(2);
  });

  it("US-25: Fri Nov 6 – Sun Nov 8, 2026 is all RDO: 0 PTO Days", () => {
    const o = newOccasion("2026-11-06", "2026-11-08");
    expect(o.days.map((d) => d.dayType)).toEqual(["rdo", "rdo", "rdo"]);
    expect(o.ptoDays).toBe(0);
  });

  it("US-25: a full Sun–Sat week in the middle has Vacation at both ends and the 2 RDOs in the middle", () => {
    // Thu Jan 7 – Tue Jan 19, 2027: Thu–Sat, the full week Sun Jan 10 – Sat Jan 16, then Sun–Tue.
    const o = newOccasion("2027-01-07", "2027-01-19");
    expect(o.days.map((d) => d.dayType)).toEqual([
      ...["rdo", "rdo", "vacation"],
      ...["vacation", "vacation", "vacation", "rdo", "rdo", "vacation", "vacation"],
      ...["vacation", "rdo", "rdo"],
    ]);
    expect(o.ptoDays).toBe(7);
  });

  it("US-25: two Occasions in one week share its two days off: Mon–Tue takes both, so Thu–Fri is Vacation, Vacation", () => {
    // Sun Sep 6 – Sat Sep 12, 2026: A is Mon Sep 7 – Tue Sep 8, B is Thu Sep 10 – Fri Sep 11.
    const a = occasion("a", "Made-up dentist days", "2026-09-07", "2026-09-08");
    const b = occasion("b", "Made-up wedding", "2026-09-10", "2026-09-11");
    const both = view(samE2, today, { occasions: [b, a] }).occasions;
    expect(both.map((o) => o.days.map((d) => d.dayType))).toEqual([
      ["rdo", "rdo"],
      ["vacation", "vacation"],
    ]);
    // Adding B once A is saved with its types does the same.
    const savedA = withResolvedTypes(a, checkOccasion(data(), today, a).view);
    expect(checkOccasion(data(savedA), today, b).view.days.map((d) => d.dayType)).toEqual(["vacation", "vacation"]);
  });

  it("US-25: a lone day off is an RDO, and a long week alone keeps 2 RDOs at the start", () => {
    expect(newOccasion("2026-09-09", "2026-09-09").days.map((d) => d.dayType)).toEqual(["rdo"]);
    // Sun Sep 6 – Sat Sep 12, 2026: one whole week, crossing no break.
    expect(newOccasion("2026-09-06", "2026-09-12").days.map((d) => d.dayType)).toEqual([
      ...["rdo", "rdo"],
      ...["vacation", "vacation", "vacation", "vacation", "vacation"],
    ]);
  });
});
