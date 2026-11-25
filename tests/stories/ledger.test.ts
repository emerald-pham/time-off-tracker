/**
 * Acceptance tests for "The Ledger" in docs/user-stories.md (US-11 to US-15;
 * US-22 is covered next to the engine and src/ui/format.ts). They run the
 * engine on Sam's made-up balance from the spec's E2 example.
 */
import { describe, expect, it } from "vitest";
import { memoryStorage, LocalDataStore } from "../../src/storage";
import { setEarnDate, resetEarnDate } from "../../src/ui/earnDateEdits";
import { typeLabel } from "../../src/ui/format";
import { floatingHolidayRows, occasion, rowByKey, rowsOf, samE2, vacationRows, view } from "./helpers";

const today = "2025-11-24";

describe("US-11: Time off fills the Ledger oldest first", () => {
  // Tue Feb 24 – Thu Feb 26, 2026 and Mon Mar 9, 2026: all Vacation by default.
  const ski = occasion("ski", "Made-up ski week", "2026-02-24", "2026-02-26");
  const spring = occasion("spring", "Made-up spring day", "2026-03-09", "2026-03-09");

  it("US-11: Burns the oldest earned Vacation rows first (spec E4)", () => {
    const v = view(samE2, today, { occasions: [ski] });
    const used = vacationRows(rowsOf(v)).filter((r) => r.burnedBy);
    expect(used.map((r) => r.earnDate)).toEqual(["2025-05-14", "2025-05-14", "2025-07-09"]);
    expect(v.occasions[0].ptoDays).toBe(3);
  });

  it("US-11: fills one row at a time, oldest to newest, naming the Occasion that used each", () => {
    const v = view(samE2, today, { occasions: [spring, ski] });
    const occasionColumn = vacationRows(rowsOf(v))
      .slice(0, 6)
      .map((r) => [r.earnDate, r.burnedBy?.occasionName ?? ""]);
    expect(occasionColumn).toEqual([
      ["2025-05-14", "Made-up ski week"],
      ["2025-05-14", "Made-up ski week"],
      ["2025-07-09", "Made-up ski week"],
      ["2025-09-10", "Made-up spring day"],
      ["2025-11-12", ""],
      ["2026-02-01", ""],
    ]);
  });

  it("US-11: fills Floating Holiday rows the same way", () => {
    const v = view(samE2, today, {
      occasions: [occasion("fh", "Made-up holiday", "2026-01-05", "2026-01-05", { "2026-01-05": "floatingHoliday" })],
    });
    const fh2026 = floatingHolidayRows(v.ledger.groups[1].rows);
    expect(fh2026.map((r) => r.burnedBy?.occasionName ?? "")).toEqual(["Made-up holiday", "", ""]);
  });
});

describe("US-12: Floating Holidays stay in their year", () => {
  const fhOn = (id: string, date: string) =>
    occasion(id, `Made-up day ${id}`, date, date, { [date]: "floatingHoliday" });

  it("US-12: covers a day with a Floating Holiday from the same year, not an older one (spec E5)", () => {
    const v = view(samE2, today, { occasions: [fhOn("jan", "2026-01-05")] });
    expect(v.occasions[0].days[0].burns).toMatch(/^fh:2026:/);
    expect(rowsOf(v).find((r) => r.earnDate === "2025-09-01")?.burnedBy).toBeNull();
  });

  it("US-12: covers a day this year with this year's Floating Holiday", () => {
    const v = view(samE2, today, { occasions: [fhOn("dec", "2025-12-01")] });
    expect(rowsOf(v).find((r) => r.earnDate === "2025-09-01")?.burnedBy?.occasionName).toBe("Made-up day dec");
  });

  it("US-12: never borrows a Floating Holiday from next year", () => {
    // Sam has one 2025 Floating Holiday; the second December day has none to use.
    const v = view(samE2, today, { occasions: [fhOn("a", "2025-12-01"), fhOn("b", "2025-12-02")] });
    expect(v.occasions.map((o) => o.short)).toEqual([0, 1]);
    expect(floatingHolidayRows(v.ledger.groups[1].rows).every((r) => r.burnedBy === null)).toBe(true);
  });

  it("US-12: warns before an unused one expires on Dec 31", () => {
    const fh = (v: ReturnType<typeof view>) => floatingHolidayRows(rowsOf(v));
    expect(fh(view(samE2, today)).map((r) => [r.earnDate, r.expiresWarning])).toEqual([
      ["2025-09-01", true],
      ["2026-01-01", false],
      ["2026-01-01", false],
      ["2026-01-01", false],
    ]);
    // Once it's used, there's nothing to warn about.
    const used = view(samE2, today, { occasions: [fhOn("dec", "2025-12-01")] });
    expect(fh(used).some((r) => r.expiresWarning)).toBe(false);
  });

  it("US-12: lets an unused one expire on Dec 31", () => {
    const jan = view(samE2, "2026-01-02");
    expect(floatingHolidayRows(rowsOf(jan)).map((r) => r.earnDate)).not.toContain("2025-09-01");
    // 2026's three Jan 1 Floating Holidays are all that's left.
    expect(jan.ledger.freeBy.earnedNow.floatingHoliday).toBe(3);
  });
});

describe("US-13: This year and next year are separated by a row", () => {
  it("US-13: groups rows by calendar year, one group per year, in order", () => {
    const v = view(samE2, today);
    expect(v.ledger.groups.map((g) => g.year)).toEqual([2025, 2026]);
    for (const g of v.ledger.groups) {
      expect(g.rows.length).toBeGreaterThan(0);
      expect(g.rows.every((r) => r.earnDate.startsWith(`${g.year}-`))).toBe(true);
    }
  });

  it("US-13: adds a group for any later year an Occasion reaches", () => {
    const v = view(samE2, today, { occasions: [occasion("far", "Made-up big trip", "2027-03-01", "2027-03-02")] });
    expect(v.ledger.groups.map((g) => g.year)).toEqual([2025, 2026, 2027]);
  });

  it("US-13: puts last year's unused Vacation at the top of this year", () => {
    const [thisYear] = view(samE2, "2026-03-01").ledger.groups;
    expect(thisYear.year).toBe(2026);
    expect(thisYear.rows.slice(0, 5).every((r) => r.carryover)).toBe(true);
    expect(thisYear.rows.slice(5).every((r) => r.earnDate.startsWith("2026-"))).toBe(true);
  });
});

describe("US-14: Change an Earn Date by tapping it", () => {
  // vacation:2026:3 is Sam's 2026 day projected for Apr 5.
  const key = "vacation:2026:3";

  it("US-14: changes the day that Benefit Day was earned", () => {
    const edits = setEarnDate({}, key, "2026-04-06");
    expect(rowByKey(view(samE2, today, { earnDateEdits: edits }), key)).toMatchObject({
      earnDate: "2026-04-06",
      edited: true,
    });
  });

  it("US-14: keeps the change when the schedule is recalculated", () => {
    const edits = setEarnDate({}, key, "2026-04-06");
    const v = view({ ...samE2, weeklyHours: 32 }, "2026-02-01", { earnDateEdits: edits });
    expect(rowByKey(v, key)).toMatchObject({ earnDate: "2026-04-06", edited: true });
  });

  it("US-14: keeps the change once saved", async () => {
    const storage = memoryStorage();
    await new LocalDataStore(storage).save({
      settings: samE2,
      occasions: [],
      earnDateEdits: setEarnDate({}, key, "2026-04-06"),
    });
    // Next visit: a new store on the same storage.
    const loaded = await new LocalDataStore(storage).load();
    expect(rowByKey(view(samE2, today, { earnDateEdits: loaded!.earnDateEdits }), key)?.earnDate).toBe("2026-04-06");
  });

  it("US-14: can be reset to the projected date", () => {
    const edits = resetEarnDate(setEarnDate({}, key, "2026-04-06"), key);
    expect(edits).toEqual({});
    expect(rowByKey(view(samE2, today, { earnDateEdits: edits }), key)).toMatchObject({
      earnDate: "2026-04-05",
      edited: false,
    });
  });
});

describe("US-15: See what's earned and what isn't", () => {
  // E2's balance viewed on Sun Mar 1, 2026.
  const v = view(samE2, "2026-03-01");
  const label = (date: string, type: "vacation" | "floatingHoliday") =>
    rowsOf(v)
      .filter((r) => r.earnDate === date && r.benefitType === type)
      .map((r) => [typeLabel(r), r.notYetEarned]);

  it("US-15: labels an Earn Date on or before today Earned, upright", () => {
    expect(label("2026-02-01", "vacation")).toEqual([["Vacation (Earned)", false]]);
    expect(label("2026-01-01", "floatingHoliday")).toEqual(Array(3).fill(["Floating Holiday (Earned)", false]));
  });

  it("US-15: labels an Earn Date after today Estimated, in italics", () => {
    expect(label("2026-03-05", "vacation")).toEqual([["Vacation (Estimated)", true]]);
    expect(label("2027-01-01", "floatingHoliday")).toEqual(Array(3).fill(["Floating Holiday (Estimated)", true]));
  });

  it("US-15: keeps the label 'Vacation (Previous Year)' for Carryover", () => {
    const carryover = rowsOf(v).filter((r) => r.carryover);
    expect(carryover).toHaveLength(5);
    expect(new Set(carryover.map(typeLabel))).toEqual(new Set(["Vacation (Previous Year)"]));
  });

  it("US-15: marks only approximate past Earn Dates, from the SAP walk-back, as approximate", () => {
    const rows = rowsOf(v);
    expect(rows.filter((r) => r.approximate).map((r) => r.origin)).toEqual(Array(5).fill("starting"));
    expect(rows.filter((r) => r.origin === "projected").some((r) => r.approximate)).toBe(false);
  });
});
