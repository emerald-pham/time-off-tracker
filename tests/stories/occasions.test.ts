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
import { occasion, samE2, view } from "./helpers";

const today = "2025-11-24";
const data = (...occasions: Occasion[]): AppData => ({ settings: samE2, occasions, earnDateEdits: {} });

describe("US-06: Add an Occasion with a name and dates", () => {
  const ski = occasion("ski", "Made-up ski week", "2026-02-24", "2026-02-26");
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
  // Fri Jan 9 – Mon Jan 12, 2026; Sam's regular days off are Saturday and Sunday.
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

  it("US-07: defaults new days to RDO on my regular days off and to Vacation otherwise", () => {
    const { view: o } = checkOccasion(data(), today, weekend);
    expect(o.days.map((d) => d.dayType)).toEqual(["vacation", "rdo", "rdo", "vacation"]);
  });

  it("US-07: Save stores the choices", () => {
    const chosen = { ...weekend, dayTypes: { "2026-01-09": "floatingHoliday" as const } };
    const saved = withResolvedTypes(chosen, checkOccasion(data(), today, chosen).view);
    expect(saved.dayTypes).toEqual({
      "2026-01-09": "floatingHoliday",
      "2026-01-10": "rdo",
      "2026-01-11": "rdo",
      "2026-01-12": "vacation",
    });
    // Stored, so changing the regular days off later doesn't move them.
    const v = view({ ...samE2, regularDaysOff: [1] }, today, { occasions: [saved] });
    expect(v.occasions[0].days.map((d) => d.dayType)).toEqual(["floatingHoliday", "rdo", "rdo", "vacation"]);
  });
});

describe("US-08: PTO Days counts only paid time off", () => {
  // Fri Jan 9 – Tue Jan 13, 2026: Floating Holiday, two RDOs, Vacation, Unpaid.
  const mixed = occasion("mixed", "Made-up family visit", "2026-01-09", "2026-01-13", {
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
  // Mon Jan 12, 2026 is Vacation by default in the ski week.
  const ski = occasion("ski", "Made-up ski week", "2026-01-12", "2026-01-16");

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
    const visit = occasion("visit", "Made-up family visit", "2026-01-12", "2026-01-13");
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
