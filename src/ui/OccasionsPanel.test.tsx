// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { computeView } from "../engine";
import type { Occasion } from "../engine";
import { sam } from "../engine/fixtures";
import type { AppData } from "../storage";
import { OccasionsPanel } from "./OccasionsPanel";
import { button, click, field, flush, maybeButton, render, text, typeInto } from "./testDom";
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
  vi.restoreAllMocks();
});

/** The panel as the app runs it: each change is saved and shown again. */
function Harness({ initial, onChange }: { initial: AppData; onChange: (o: Occasion[]) => void }) {
  const [current, setCurrent] = useState(initial);
  const view = computeView({ ...current, today: TODAY });
  return (
    <OccasionsPanel
      data={current}
      today={TODAY}
      occasions={view.occasions}
      onChange={(occasions) => {
        onChange(occasions);
        setCurrent({ ...current, occasions });
      }}
    />
  );
}

async function show(occasions: Occasion[] = data.occasions) {
  const onChange = vi.fn();
  mounted = await render(<Harness initial={{ ...data, occasions }} onChange={onChange} />);
  return { el: mounted.el, onChange };
}

/** The Occasions most recently saved. */
const saved = (onChange: ReturnType<typeof vi.fn>): Occasion[] => onChange.mock.calls.at(-1)![0];

function card(el: HTMLElement, name: string): HTMLElement {
  const found = [...el.querySelectorAll<HTMLElement>(".occasion-card")].find((c) =>
    text(c.querySelector(".occasion-name")!).includes(name),
  );
  if (!found) throw new Error(`No Occasion card "${name}" in: ${text(el)}`);
  return found;
}

const addForm = (el: HTMLElement) => el.querySelector<HTMLFormElement>("form.add-occasion")!;

async function addOccasion(el: HTMLElement, name: string, start: string, end = "") {
  await typeInto(field(addForm(el), "Occasion name"), name);
  await typeInto(field(addForm(el), "Start"), start);
  if (end) await typeInto(field(addForm(el), "End"), end);
  await click(button(addForm(el), "Add Occasion"));
}

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
    await typeInto(field(addForm(el), "Occasion name"), "Typo trip");
    await typeInto(field(addForm(el), "Start"), "0026-01-05");
    expect(field(addForm(el), "Start").validity.rangeUnderflow).toBe(true);
    await click(button(addForm(el), "Add Occasion"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses it itself where the browser doesn't check", async () => {
    const { el, onChange } = await show();
    await typeInto(field(addForm(el), "Occasion name"), "Typo trip");
    await typeInto(field(addForm(el), "Start"), "0026-01-05");
    await submitUnchecked(addForm(el));
    expect(onChange).not.toHaveBeenCalled();
    expect(text(el)).toContain("between 1950 and 2100");
  });

  it("adds it once the date is real", async () => {
    const { el, onChange } = await show();
    await addOccasion(el, "Fixed trip", "2027-01-05");
    expect(onChange).toHaveBeenCalledOnce();
    expect(saved(onChange).find((o) => o.name === "Fixed trip")).toMatchObject({
      start: "2027-01-05",
      end: "2027-01-05",
    });
  });

  it("won't save an edited Occasion moved outside the supported years", async () => {
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Edit"));
    const details = el.querySelector<HTMLFormElement>("form.details-editor")!;
    await typeInto(field(details, "End"), "2150-03-02");
    expect(field(details, "End").validity.rangeOverflow).toBe(true);
    await submitUnchecked(details);
    expect(onChange).not.toHaveBeenCalled();
    expect(text(el)).toContain("between 1950 and 2100");
  });
});

describe("approval status", () => {
  const badge = (el: HTMLElement) => text(card(el, "Made-up trip").querySelector(".badge")!).trim();

  it("US-23: an Occasion saved before approval existed shows 'Not approved yet'", async () => {
    const { el } = await show();
    expect(badge(el)).toBe("Not approved yet");
  });

  it("US-23: Approve switches it to 'Approved', and Unapprove switches it back", async () => {
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Approve"));
    expect(saved(onChange)).toEqual([{ ...trip, approved: true }]);
    expect(badge(el)).toBe("Approved");

    await click(button(card(el, "Made-up trip"), "Unapprove"));
    expect(saved(onChange)).toEqual([trip]);
    expect(badge(el)).toBe("Not approved yet");
  });

  it("US-23: an Occasion not approved yet still counts its PTO Days", async () => {
    const { el } = await show();
    expect(text(card(el, "Made-up trip").querySelector(".pto-count")!).trim()).toBe("2");
  });
});

describe("discoverable Occasions", () => {
  it("US-24: each Occasion has large labelled buttons, and no caret", async () => {
    const { el } = await show();
    const labels = [...card(el, "Made-up trip").querySelectorAll(".occasion-actions button")].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(["Edit", "Choose days", "Approve", "Delete"]);
    expect(text(el)).not.toMatch(/[▸▾]/);
  });

  it("US-24: Edit opens the name and dates, each with a visible label, and saves them", async () => {
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Edit"));
    const c = card(el, "Made-up trip");
    expect(field(c, "Start").value).toBe("2027-03-01");
    expect(field(c, "End").value).toBe("2027-03-02");
    await typeInto(field(c, "Occasion name"), "Renamed trip");
    await click(button(c, "Save"));
    expect(saved(onChange)[0]).toMatchObject({ id: "trip", name: "Renamed trip" });
    expect(el.querySelector("form.details-editor")).toBeNull();
  });

  it("US-24: Choose days opens one labelled Day Type choice per day", async () => {
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Choose days"));
    const days = [...card(el, "Made-up trip").querySelectorAll(".day")];
    expect(days.map((d) => text(d.querySelector(".day-label")!).trim())).toEqual([
      "Mon, Mar 1st 2027",
      "Tue, Mar 2nd 2027",
    ]);
    const select = days[1].querySelector("select")!;
    await act(async () => {
      select.value = "floatingHoliday";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(button(card(el, "Made-up trip"), "Save"));
    expect(saved(onChange)[0].dayTypes).toEqual({ "2027-03-01": "vacation", "2027-03-02": "floatingHoliday" });
  });

  it("US-24: Delete asks on the page, not in a browser dialog", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Delete"));
    expect(text(card(el, "Made-up trip"))).toContain("Delete 'Made-up trip'?");
    await click(button(card(el, "Made-up trip"), "Keep it"));
    expect(onChange).not.toHaveBeenCalled();
    expect(maybeButton(el, "Yes, delete")).toBeUndefined();

    await click(button(card(el, "Made-up trip"), "Delete"));
    await click(button(card(el, "Made-up trip"), "Yes, delete"));
    expect(saved(onChange)).toEqual([]);
    expect(el.querySelector(".occasion-card")).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("US-24: every field has a visible label", async () => {
    const { el } = await show();
    await click(button(card(el, "Made-up trip"), "Edit"));
    const fields = [...el.querySelectorAll<HTMLElement>("input, select")];
    expect(fields.length).toBeGreaterThan(3);
    for (const f of fields) {
      expect(f.closest("label")?.querySelector("span")?.textContent?.trim(), f.outerHTML).toBeTruthy();
    }
    await click(button(card(el, "Made-up trip"), "Choose days"));
    const selects = [...el.querySelectorAll("select")];
    expect(selects.length).toBe(2);
    for (const s of selects) expect(s.closest("label")?.querySelector(".day-label")?.textContent?.trim()).toBeTruthy();
  });

  it("US-21: the Day Type choices are exactly RDO, Floating Holiday, Vacation and Unpaid", async () => {
    const { el } = await show();
    await click(button(card(el, "Made-up trip"), "Choose days"));
    const options = [...el.querySelector(".day select")!.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual(["RDO", "Floating Holiday", "Vacation", "Unpaid"]);
  });
});

describe("wrong-year safeguards", () => {
  const december: Occasion = { id: "dec", name: "December days", start: "2026-12-21", end: "2026-12-23", dayTypes: {} };
  const taken: Occasion = { id: "jan", name: "January days", start: "2026-01-05", end: "2026-01-06", dayTypes: {} };

  it("US-10: shows the year in an Occasion's dates when it isn't the current year", async () => {
    const { el } = await show([trip, december]);
    expect(text(card(el, "Made-up trip").querySelector(".dates")!).trim()).toBe("Mon Mar 1 – Tue Mar 2, 2027");
    expect(text(card(el, "December days").querySelector(".dates")!).trim()).toBe("Mon Dec 21 – Wed Dec 23");
  });

  it("US-10: a new Occasion with past dates asks about next year, and one tap moves it there", async () => {
    const { el, onChange } = await show([]);
    await addOccasion(el, "Typo trip", "2026-01-05", "2026-01-06");
    expect(text(el)).toContain("These dates are in the past. Did you mean 2027?");
    const id = saved(onChange)[0].id;

    await click(button(el, "Move to 2027"));
    expect(saved(onChange)).toEqual([
      {
        id,
        name: "Typo trip",
        start: "2027-01-05",
        end: "2027-01-06",
        dayTypes: { "2027-01-05": "vacation", "2027-01-06": "vacation" },
      },
    ]);
    expect(text(el)).not.toContain("Did you mean");
    expect(text(card(el, "Typo trip").querySelector(".dates")!).trim()).toBe("Tue Jan 5 – Wed Jan 6, 2027");
  });

  it("US-10: the question can be dismissed, keeping the dates", async () => {
    const { el, onChange } = await show([]);
    await addOccasion(el, "Old trip", "2026-01-05");
    await click(button(el, "Keep these dates"));
    expect(text(el)).not.toContain("Did you mean");
    expect(saved(onChange)[0]).toMatchObject({ start: "2026-01-05" });
  });

  it("US-10: doesn't ask when a new Occasion's dates are ahead", async () => {
    const { el } = await show([]);
    await addOccasion(el, "Future trip", "2027-02-01");
    expect(text(el)).not.toContain("in the past");
  });

  it("US-10: labels a past Occasion as already taken and counted in the SAP Balance", async () => {
    const { el } = await show([trip, taken]);
    expect(text(card(el, "January days"))).toContain("Already taken · counted in your SAP balance");
    expect(text(card(el, "Made-up trip"))).not.toContain("Already taken");
  });
});
