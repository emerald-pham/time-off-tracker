// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeView } from "../engine";
import type { EarnDateEdits } from "../engine";
import { sam } from "../engine/fixtures";
import { LedgerPanel } from "./LedgerPanel";
import { click, field, render, text } from "./testDom";
import type { Rendered } from "./testDom";

let mounted: Rendered | null = null;
afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
});

/** Sam's Ledger as of Nov 24, 2025 (E2), viewed on `today`. */
async function ledger(earnDateEdits: EarnDateEdits = {}, today = "2025-11-24") {
  const settings = { ...sam, sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" };
  const view = computeView({ settings, occasions: [], earnDateEdits, today });
  mounted = await render(
    <LedgerPanel
      ledger={view.ledger}
      configured
      hireDate={settings.hireDate}
      onEditEarnDate={vi.fn()}
      onResetEarnDate={vi.fn()}
    />,
  );
  return mounted.el;
}

const openRow = async (el: HTMLElement, key: string) =>
  click(el.querySelector<HTMLButtonElement>(`tr[data-key="${key}"] button.earn-date-button`)!);

describe("the Earn Date picker (finding 14)", () => {
  it("runs from the hire date to 2100 for Vacation", async () => {
    const el = await ledger();
    await openRow(el, "vacation:2026:1");
    expect([field(el, "Earn Date").min, field(el, "Earn Date").max]).toEqual(["2024-08-14", "2100-12-31"]);
  });

  it("keeps a Floating Holiday within its calendar year", async () => {
    const el = await ledger();
    await openRow(el, "fh:2026:1");
    expect([field(el, "Earn Date").min, field(el, "Earn Date").max]).toEqual(["2026-01-01", "2026-12-31"]);
  });

  it("shows an edited row that has Expired, so it can be reset", async () => {
    // Jan 1, 2026 moved to Dec 1, 2025, viewed in March 2026: expired, but edited.
    const el = await ledger({ "fh:2026:1": "2025-12-01" }, "2026-03-01");
    const row = el.querySelector('tr[data-key="fh:2026:1"]')!;
    expect(text(row)).toContain("Expired");
    await openRow(el, "fh:2026:1");
    expect(text(el)).toContain("Reset to projected");
  });
});

describe("the summary", () => {
  it("US-22: shows free days earned now, by the end of this year and by the end of next year", async () => {
    const el = await ledger();
    const lines = [...el.querySelectorAll(".summary li")].map((li) => text(li));
    expect(lines).toEqual([
      "Earned now: 5 Vacation, 1 Floating Holiday",
      "By end of 2025: 5 Vacation, 1 Floating Holiday",
      "By end of 2026: 15 Vacation, 3 Floating Holidays",
    ]);
    expect(text(el)).not.toContain("Free:");
  });
});

describe("Earned, Estimated and Approximate Earn Dates", () => {
  const rowEl = (el: HTMLElement, key: string) => el.querySelector<HTMLElement>(`tr[data-key="${key}"]`)!;
  const dateButton = (el: HTMLElement, key: string) =>
    rowEl(el, key).querySelector<HTMLButtonElement>("button.earn-date-button")!;

  it("US-15: marks a date later than today not yet earned, for italics, and labels it Estimated", async () => {
    const el = await ledger();
    expect(rowEl(el, "vacation:2026:1").classList.contains("not-yet-earned")).toBe(true);
    expect(text(rowEl(el, "vacation:2026:1"))).toContain("Vacation (Estimated)");
  });

  it("US-15: leaves an earned date upright, labelled Earned", async () => {
    const el = await ledger();
    expect(rowEl(el, "vacation:2025:5").classList.contains("not-yet-earned")).toBe(false);
    expect(text(rowEl(el, "vacation:2025:5"))).toContain("Vacation (Earned)");
    expect(text(rowEl(el, "fh:2025:3"))).toContain("Floating Holiday (Earned)");
  });

  it("US-15: puts '*' after an approximate date, with a legend line, and no '~'", async () => {
    const el = await ledger();
    expect(text(dateButton(el, "vacation:2025:5")).trim()).toBe("Nov 12 *");
    expect(text(dateButton(el, "vacation:2026:1")).trim()).toBe("Feb 1");
    expect(text(el.querySelector(".legend")!)).toContain("* approximate date");
    expect(text(el)).not.toContain("~");
  });
});
