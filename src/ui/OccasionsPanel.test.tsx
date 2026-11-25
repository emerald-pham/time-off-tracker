// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { computeView } from "../engine";
import type { Occasion } from "../engine";
import { sam } from "../engine/fixtures";
import type { AppData } from "../storage";
import { OccasionsPanel } from "./OccasionsPanel";
import { button, click, field, flush, render, text, typeInto } from "./testDom";
import type { Rendered } from "./testDom";

const TODAY = "2026-11-24";
const trip: Occasion = { id: "trip", name: "Made-up trip", start: "2027-03-01", end: "2027-03-02", dayTypes: {} };
const data: AppData = {
  settings: { ...sam, sapVacationHours: 40, sapAsOf: "2026-11-01" },
  occasions: [trip],
  earnDateEdits: {},
};

let mounted: Rendered | null = null;
afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
});

async function show() {
  const onChange = vi.fn();
  const view = computeView({ ...data, today: TODAY });
  mounted = await render(<OccasionsPanel data={data} today={TODAY} occasions={view.occasions} onChange={onChange} />);
  return { el: mounted.el, onChange };
}

const addForm = (el: HTMLElement) => el.querySelector<HTMLFormElement>("form.add-occasion")!;

/** Submits the way a browser that skips its own date checks would. */
async function submitUnchecked(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();
}

describe("Occasion dates must be real and between 1950 and 2100 (finding 16)", () => {
  it("offers only dates from 1950 to 2100, so the browser stops a two-digit year", async () => {
    const { el, onChange } = await show();
    await typeInto(field(addForm(el), "Occasion"), "Typo trip");
    await typeInto(field(addForm(el), "Start"), "0026-01-05");
    expect(field(addForm(el), "Start").validity.rangeUnderflow).toBe(true);
    await click(button(addForm(el), "Add"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses it itself where the browser doesn't check", async () => {
    const { el, onChange } = await show();
    await typeInto(field(addForm(el), "Occasion"), "Typo trip");
    await typeInto(field(addForm(el), "Start"), "0026-01-05");
    await submitUnchecked(addForm(el));
    expect(onChange).not.toHaveBeenCalled();
    expect(text(el)).toContain("between 1950 and 2100");
  });

  it("adds it once the date is real", async () => {
    const { el, onChange } = await show();
    await typeInto(field(addForm(el), "Occasion"), "Fixed trip");
    await typeInto(field(addForm(el), "Start"), "2027-01-05");
    await click(button(addForm(el), "Add"));
    expect(onChange).toHaveBeenCalledOnce();
    const saved: Occasion[] = onChange.mock.calls[0][0];
    expect(saved.find((o) => o.name === "Fixed trip")).toMatchObject({ start: "2027-01-05", end: "2027-01-05" });
  });

  it("won't save an edited Occasion moved outside the supported years", async () => {
    const { el, onChange } = await show();
    await click(button(el, "Made-up trip"));
    const details = el.querySelector<HTMLFormElement>("form.details-editor")!;
    await typeInto(field(details, "End"), "2150-03-02");
    expect(field(details, "End").validity.rangeOverflow).toBe(true);
    await submitUnchecked(details);
    expect(onChange).not.toHaveBeenCalled();
    expect(text(el)).toContain("between 1950 and 2100");
  });
});
