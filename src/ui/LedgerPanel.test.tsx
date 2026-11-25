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
