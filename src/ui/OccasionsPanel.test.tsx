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
const trip: Occasion = {
  id: "trip",
  name: "Made-up trip",
  start: "2027-03-01",
  end: "2027-03-02",
  dayTypes: { "2027-03-01": "vacation", "2027-03-02": "vacation" },
};
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
    // The end date fills in as the day after (US-27).
    expect(saved(onChange).find((o) => o.name === "Fixed trip")).toMatchObject({
      start: "2027-01-05",
      end: "2027-01-06",
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

describe("filling in the end date", () => {
  const details = (el: HTMLElement) => el.querySelector<HTMLFormElement>("form.details-editor")!;

  it("US-27: entering a start date in Add Occasion sets an empty end date to the day after", async () => {
    const { el } = await show([]);
    await typeInto(field(addForm(el), "Start"), "2027-03-01");
    expect(field(addForm(el), "End").value).toBe("2027-03-02");
  });

  it("US-27: works across a month and a year end", async () => {
    const { el } = await show([]);
    await typeInto(field(addForm(el), "Start"), "2026-12-31");
    expect(field(addForm(el), "End").value).toBe("2027-01-01");
  });

  it("US-27: an end date earlier than the new start moves to the day after it", async () => {
    const { el } = await show([]);
    await typeInto(field(addForm(el), "Start"), "2027-03-01");
    await typeInto(field(addForm(el), "Start"), "2027-03-10");
    expect(field(addForm(el), "End").value).toBe("2027-03-11");
  });

  it("US-27: never overwrites a valid end date I chose", async () => {
    const { el, onChange } = await show([]);
    await typeInto(field(addForm(el), "Occasion name"), "Made-up week away");
    await typeInto(field(addForm(el), "Start"), "2027-03-01");
    await typeInto(field(addForm(el), "End"), "2027-03-07");
    await typeInto(field(addForm(el), "Start"), "2027-03-03");
    expect(field(addForm(el), "End").value).toBe("2027-03-07");
    // The same day as the start is a valid end too: a one-day Occasion.
    await typeInto(field(addForm(el), "End"), "2027-03-03");
    await typeInto(field(addForm(el), "Start"), "2027-03-03");
    expect(field(addForm(el), "End").value).toBe("2027-03-03");
    await click(button(addForm(el), "Add Occasion"));
    expect(saved(onChange)[0]).toMatchObject({ start: "2027-03-03", end: "2027-03-03" });
  });

  it("US-27: waits for a real date, not the partial years a date field passes through", async () => {
    const { el } = await show([]);
    await typeInto(field(addForm(el), "Start"), "0002-03-01");
    expect(field(addForm(el), "End").value).toBe("");
    await typeInto(field(addForm(el), "Start"), "2027-03-01");
    expect(field(addForm(el), "End").value).toBe("2027-03-02");
  });

  it("US-27: in 'Edit name and dates', an end date earlier than the new start moves to the day after it", async () => {
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Edit"));
    await typeInto(field(details(el), "Start"), "2027-03-05");
    expect(field(details(el), "End").value).toBe("2027-03-06");
    await click(button(details(el), "Save"));
    expect(saved(onChange)[0]).toMatchObject({ start: "2027-03-05", end: "2027-03-06" });
  });

  it("US-27: in 'Edit name and dates', a cleared end date is set to the day after the start", async () => {
    const { el } = await show();
    await click(button(card(el, "Made-up trip"), "Edit"));
    await typeInto(field(details(el), "End"), "");
    await typeInto(field(details(el), "Start"), "2027-02-27");
    expect(field(details(el), "End").value).toBe("2027-02-28");
  });

  it("US-27: in 'Edit name and dates', a valid end date stays as it is", async () => {
    const { el } = await show();
    await click(button(card(el, "Made-up trip"), "Edit"));
    await typeInto(field(details(el), "Start"), "2027-02-25");
    expect(field(details(el), "End").value).toBe("2027-03-02");
  });
});

describe("approval status", () => {
  const badge = (el: HTMLElement) => text(card(el, "Made-up trip").querySelector(".badge")!).trim();
  const switches = (el: HTMLElement) => [...card(el, "Made-up trip").querySelectorAll<HTMLElement>('.day [role="switch"]')];

  it("US-23: an Occasion saved before approval existed shows 'Not approved yet'", async () => {
    const { el } = await show();
    expect(badge(el)).toBe("Not approved yet");
  });

  it("US-23: 'Approve all' approves every day, and 'Unapprove all' switches them all back", async () => {
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Approve all"));
    expect(saved(onChange)).toEqual([{ ...trip, approvedDays: ["2027-03-01", "2027-03-02"], approved: true }]);
    expect(badge(el)).toBe("Approved");
    expect(maybeButton(card(el, "Made-up trip"), "Approve all")).toBeUndefined();

    await click(button(card(el, "Made-up trip"), "Unapprove all"));
    expect(saved(onChange)).toEqual([trip]);
    expect(badge(el)).toBe("Not approved yet");
    expect(maybeButton(card(el, "Made-up trip"), "Unapprove all")).toBeUndefined();
  });

  it("US-23: 'Approve all' and 'Unapprove all' step aside while that Occasion's 'Choose days' is open", async () => {
    const week: Occasion = { ...trip, end: "2027-03-03", approvedDays: ["2027-03-02"] };
    const { el } = await show([week]);
    const c = () => card(el, "Made-up trip");
    await click(button(c(), "Choose days"));
    expect(maybeButton(c(), "Approve all")).toBeUndefined();
    expect(maybeButton(c(), "Unapprove all")).toBeUndefined();
    await click(button(c(), "Cancel"));
    expect(maybeButton(c(), "Approve all")).toBeDefined();
    expect(maybeButton(c(), "Unapprove all")).toBeDefined();
  });

  it("US-23: saving 'Choose days' keeps approval changed meanwhile for every day not switched in the editor", async () => {
    // Mon Mar 1 – Wed Mar 3, 2027, with Mon approved.
    const week: Occasion = { ...trip, end: "2027-03-03", dayTypes: {}, approvedDays: ["2027-03-01"] };
    let setData: (d: AppData) => void = () => {};
    const onChange = vi.fn();
    function Remote() {
      const [current, setCurrent] = useState<AppData>({ ...data, occasions: [week] });
      setData = setCurrent;
      return (
        <OccasionsPanel
          data={current}
          today={TODAY}
          occasions={computeView({ ...current, today: TODAY }).occasions}
          onChange={(occasions) => {
            onChange(occasions);
            setCurrent({ ...current, occasions });
          }}
        />
      );
    }
    mounted = await render(<Remote />);
    const { el } = mounted;
    await click(button(card(el, "Made-up trip"), "Choose days"));
    // Mon switched to Not approved in the editor, then every day is approved meanwhile (another device, say).
    await click(switches(el)[0]);
    await act(async () =>
      setData({ ...data, occasions: [{ ...week, approvedDays: ["2027-03-01", "2027-03-02", "2027-03-03"], approved: true }] }),
    );
    await click(button(card(el, "Made-up trip"), "Save"));
    // Mon is the editor's to decide; Tue and Wed keep the approval saved meanwhile.
    expect(saved(onChange)[0].approvedDays).toEqual(["2027-03-02", "2027-03-03"]);
  });

  it("US-23: an Occasion saved approved before per-day approval shows every day approved", async () => {
    const { el } = await show([{ ...trip, approved: true }]);
    expect(badge(el)).toBe("Approved");
    await click(button(card(el, "Made-up trip"), "Choose days"));
    expect(switches(el).map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "true"]);
  });

  it("US-23: a partly approved Occasion says how many days are approved, and offers both buttons", async () => {
    // Mon Mar 1 – Fri Mar 5, 2027, with Tue and Thu approved.
    const week: Occasion = { ...trip, end: "2027-03-05", approvedDays: ["2027-03-02", "2027-03-04"] };
    const { el, onChange } = await show([week]);
    expect(badge(el)).toBe("Partly approved · 2 of 5 days");
    await click(button(card(el, "Made-up trip"), "Approve all"));
    expect(saved(onChange)[0]).toMatchObject({ approved: true });
    expect(saved(onChange)[0].approvedDays).toHaveLength(5);
  });

  it("US-23: each day in 'Choose days' has a large Approved / Not approved switch; Save keeps it, Cancel drops it", async () => {
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Choose days"));
    expect(switches(el).map((s) => [s.textContent?.trim(), s.getAttribute("aria-checked")])).toEqual([
      ["Not approved", "false"],
      ["Not approved", "false"],
    ]);
    // It's a button of its own, next to the day's Day Type, so the whole thing is a big target.
    expect(switches(el)[0].tagName).toBe("BUTTON");
    expect(switches(el)[0].closest(".day")!.querySelector("select")).not.toBeNull();

    await click(switches(el)[1]);
    expect(switches(el)[1].textContent?.trim()).toBe("Approved");
    expect(onChange).not.toHaveBeenCalled();
    await click(button(card(el, "Made-up trip"), "Save"));
    expect(saved(onChange)).toEqual([{ ...trip, approvedDays: ["2027-03-02"] }]);
    expect(badge(el)).toBe("Partly approved · 1 of 2 days");

    await click(button(card(el, "Made-up trip"), "Choose days"));
    await click(switches(el)[0]);
    await click(button(card(el, "Made-up trip"), "Cancel"));
    expect(saved(onChange)).toEqual([{ ...trip, approvedDays: ["2027-03-02"] }]);
  });

  it("US-23: Deducted days in 'Choose days' have no switch, and an already-taken Occasion has none at all", async () => {
    // Fri Oct 23 – Tue Nov 24, 2026, SAP read Nov 1: Fri–Sat were paid Oct 29, so they're Deducted.
    const straddling: Occasion = { id: "s", name: "Straddling leave", start: "2026-10-23", end: "2026-11-24", dayTypes: {} };
    const taken: Occasion = { id: "jan", name: "January days", start: "2026-01-05", end: "2026-01-06", dayTypes: {} };
    const { el } = await show([straddling, taken]);
    await click(button(card(el, "Straddling leave"), "Choose days"));
    const rows = [...card(el, "Straddling leave").querySelectorAll(".day")];
    expect(rows.slice(0, 4).map((r) => r.querySelector('[role="switch"]') !== null)).toEqual([false, false, true, true]);
    await click(button(card(el, "January days"), "Choose days"));
    expect(card(el, "January days").querySelectorAll('[role="switch"]')).toHaveLength(0);
  });

  it("US-23: changing the dates keeps the approval of days still in range; added days start unapproved", async () => {
    const { el, onChange } = await show([{ ...trip, approved: true }]);
    await click(button(card(el, "Made-up trip"), "Edit"));
    await typeInto(field(card(el, "Made-up trip"), "End"), "2027-03-03");
    await click(button(card(el, "Made-up trip"), "Save"));
    expect(saved(onChange)[0]).toMatchObject({ end: "2027-03-03", approvedDays: ["2027-03-01", "2027-03-02"] });
    expect(saved(onChange)[0].approved).toBeUndefined();
    expect(badge(el)).toBe("Partly approved · 2 of 3 days");
  });

  it("US-23: a Deducted Occasion shows no approval badge or Approve button: 'Already taken' says it all", async () => {
    // Mon Jan 5 – Tue Jan 6, 2026, paid long before SAP was read on Nov 1.
    const taken: Occasion = { id: "jan", name: "January days", start: "2026-01-05", end: "2026-01-06", dayTypes: {} };
    const { el } = await show([trip, taken]);
    const c = card(el, "January days");
    expect(text(c)).toContain("Already taken");
    expect(c.querySelector(".badge")).toBeNull();
    expect(text(c)).not.toMatch(/approved/i);
    expect(maybeButton(c, "Approve all")).toBeUndefined();
    expect(maybeButton(c, "Unapprove all")).toBeUndefined();
    expect([...c.querySelectorAll(".occasion-actions button")].map((b) => b.textContent?.trim())).toEqual([
      "Edit",
      "Choose days",
      "Delete",
    ]);
    // An Occasion ahead still shows both.
    expect(badge(el)).toBe("Not approved yet");
  });

  it("US-23: an Occasion not approved yet still counts its PTO Days", async () => {
    const { el } = await show();
    expect(text(card(el, "Made-up trip").querySelector(".pto")!).trim()).toBe("2 Vacation");
  });

  it("US-08: the card shows the days by type, with no separate big total", async () => {
    const mixed: Occasion = {
      id: "mixed",
      name: "Made-up mixed trip",
      start: "2027-03-01",
      end: "2027-03-06",
      dayTypes: {
        "2027-03-01": "vacation",
        "2027-03-02": "vacation",
        "2027-03-03": "floatingHoliday",
        "2027-03-04": "rdo",
        "2027-03-05": "rdo",
        "2027-03-06": "unpaid",
      },
    };
    const { el } = await show([mixed]);
    const pto = card(el, "Made-up mixed trip").querySelector(".pto")!;
    expect(pto.querySelector(".pto-count")).toBeNull();
    expect([...pto.querySelectorAll(".chip")].map((c) => text(c).trim())).toEqual([
      "2 Vacation",
      "1 Floating Holiday",
      "2 RDO",
      "+1 unpaid",
    ]);
    // No bare number standing on its own as a total.
    expect([...pto.querySelectorAll("*")].some((c) => /^\d+$/.test(text(c).trim()))).toBe(false);
  });
});

describe("discoverable Occasions", () => {
  it("US-24: each Occasion has large labelled buttons, and no caret", async () => {
    const { el } = await show();
    const labels = [...card(el, "Made-up trip").querySelectorAll(".occasion-actions button")].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(["Edit", "Choose days", "Approve all", "Delete"]);
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
        // The moved dates get their defaults: Tue–Wed within one week are the week's 2 RDOs (US-25).
        dayTypes: { "2027-01-05": "rdo", "2027-01-06": "rdo" },
      },
    ]);
    expect(text(el)).not.toContain("Did you mean");
    expect(text(card(el, "Typo trip").querySelector(".dates")!).trim()).toBe("Tue Jan 5 – Wed Jan 6, 2027");
  });

  it("US-10: dates more than a year back move to the first year they're ahead, named on the button", async () => {
    const { el, onChange } = await show([]);
    // Mar 1, 2024 is still past in 2025 and 2026, so it moves to Mar 1, 2027.
    await addOccasion(el, "Long-ago typo", "2024-03-01", "2024-03-01");
    expect(text(el)).toContain("These dates are in the past. Did you mean 2027?");
    await click(button(el, "Move to 2027"));
    expect(saved(onChange)[0]).toMatchObject({ start: "2027-03-01", end: "2027-03-01" });
    expect(text(el)).not.toContain("in the past");
  });

  it("US-10: moving keeps the Floating Holiday and Unpaid days I chose, in the same place", async () => {
    const { el, onChange } = await show([]);
    // Mon Jan 5 – Wed Jan 7, 2026.
    await addOccasion(el, "Typo trip", "2026-01-05", "2026-01-07");
    await click(button(card(el, "Typo trip"), "Choose days"));
    const selects = [...card(el, "Typo trip").querySelectorAll<HTMLSelectElement>(".day select")];
    for (const [i, type] of [[0, "floatingHoliday"], [2, "unpaid"]] as const) {
      await act(async () => {
        selects[i].value = type;
        selects[i].dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    await click(button(card(el, "Typo trip"), "Save"));
    await click(button(el, "Move to 2027"));
    // Tue Jan 5 – Thu Jan 7, 2027: the weekly rule makes Wed an RDO; the choices keep their places.
    expect(saved(onChange)[0].dayTypes).toEqual({
      "2027-01-05": "floatingHoliday",
      "2027-01-06": "rdo",
      "2027-01-07": "unpaid",
    });
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

describe("filling in Day Types automatically", () => {
  const chosenTypes = (el: HTMLElement) =>
    [...card(el, "Made-up trip").querySelectorAll<HTMLSelectElement>(".day select")].map((s) => s.value);

  it("US-25: the day editor's large 'Fill in automatically' button applies the weekly rule to the draft, and Save commits it", async () => {
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Choose days"));
    expect(chosenTypes(el)).toEqual(["vacation", "vacation"]);

    // Mon Mar 1 – Tue Mar 2, 2027 lie within one week: the week's 2 RDOs.
    await click(button(card(el, "Made-up trip"), "Fill in automatically"));
    expect(chosenTypes(el)).toEqual(["rdo", "rdo"]);
    expect(onChange).not.toHaveBeenCalled();

    await click(button(card(el, "Made-up trip"), "Save"));
    expect(saved(onChange)[0].dayTypes).toEqual({ "2027-03-01": "rdo", "2027-03-02": "rdo" });
  });

  it("US-25: 'Fill in automatically' leaves the week's days off another Occasion already holds", async () => {
    // Thu Mar 4 – Fri Mar 5, 2027 are RDO in another Occasion: that week's two days off are taken.
    const concert: Occasion = {
      id: "concert",
      name: "Made-up concert",
      start: "2027-03-04",
      end: "2027-03-05",
      dayTypes: { "2027-03-04": "rdo", "2027-03-05": "rdo" },
    };
    const { el } = await show([trip, concert]);
    await click(button(card(el, "Made-up trip"), "Choose days"));
    await click(button(card(el, "Made-up trip"), "Fill in automatically"));
    expect(chosenTypes(el)).toEqual(["vacation", "vacation"]);
  });

  it("US-25: a new Occasion gets only the days off left in its week", async () => {
    const { el, onChange } = await show([{ ...trip, dayTypes: { "2027-03-01": "rdo", "2027-03-02": "rdo" } }]);
    await addOccasion(el, "Made-up concert", "2027-03-04", "2027-03-05");
    expect(saved(onChange).find((o) => o.name === "Made-up concert")!.dayTypes).toEqual({
      "2027-03-04": "vacation",
      "2027-03-05": "vacation",
    });
  });

  it("US-18: with regular days off saved by an older version, a new Occasion still gets the weekly rule", async () => {
    const onChange = vi.fn();
    const older: AppData = { ...data, settings: { ...data.settings, regularDaysOff: [0, 6] }, occasions: [] };
    mounted = await render(<Harness initial={older} onChange={onChange} />);
    // Mon Mar 8 – Tue Mar 9, 2027: the old default would be Vacation, Vacation.
    await addOccasion(mounted.el, "Made-up concert", "2027-03-08", "2027-03-09");
    expect(saved(onChange)[0].dayTypes).toEqual({ "2027-03-08": "rdo", "2027-03-09": "rdo" });
  });

  it("US-25: 'Fill in automatically' leaves Deducted days as they are", async () => {
    // Thu Oct 22 – Mon Oct 26, 2026, SAP read Nov 1: Thu–Sat were paid Oct 29, so they're Deducted.
    const straddling: Occasion = {
      id: "straddling",
      name: "Made-up trip",
      start: "2026-10-22",
      end: "2026-10-26",
      dayTypes: {
        "2026-10-22": "vacation",
        "2026-10-23": "vacation",
        "2026-10-24": "unpaid",
        "2026-10-25": "vacation",
        "2026-10-26": "vacation",
      },
    };
    const { el, onChange } = await show([straddling]);
    await click(button(card(el, "Made-up trip"), "Choose days"));
    await click(button(card(el, "Made-up trip"), "Fill in automatically"));
    // Sun–Mon carry on from the week before: the week's 2 RDOs.
    expect(chosenTypes(el)).toEqual(["vacation", "vacation", "unpaid", "rdo", "rdo"]);
    await click(button(card(el, "Made-up trip"), "Save"));
    expect(saved(onChange)[0].dayTypes).toMatchObject({ "2026-10-22": "vacation", "2026-10-24": "unpaid" });
  });

  it("US-25: Cancel discards what 'Fill in automatically' did", async () => {
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Choose days"));
    await click(button(card(el, "Made-up trip"), "Fill in automatically"));
    await click(button(card(el, "Made-up trip"), "Cancel"));
    expect(onChange).not.toHaveBeenCalled();
    await click(button(card(el, "Made-up trip"), "Choose days"));
    expect(chosenTypes(el)).toEqual(["vacation", "vacation"]);
  });
});

describe("too many RDOs in a week", () => {
  // Thu Mar 4 – Fri Mar 5, 2027 are RDO in another Occasion: the week of Sun Feb 28 has its two days off.
  const concert: Occasion = {
    id: "concert",
    name: "Made-up concert",
    start: "2027-03-04",
    end: "2027-03-05",
    dayTypes: { "2027-03-04": "rdo", "2027-03-05": "rdo" },
  };
  const warning = (c: Element) => c.querySelector(".rdo-warning");
  const MESSAGE =
    "Too many RDOs: the week of Sun Feb 28, 2027 has 4 RDOs across 'Made-up trip' and 'Made-up concert'. A week only has 2.";

  it("US-29: each Occasion in a week with more than two RDOs shows a red warning naming them", async () => {
    const { el } = await show([{ ...trip, dayTypes: { "2027-03-01": "rdo", "2027-03-02": "rdo" } }, concert]);
    for (const name of ["Made-up trip", "Made-up concert"]) {
      const w = warning(card(el, name))!;
      expect(text(w).trim()).toBe(MESSAGE);
      expect(w.classList).toContain("clash-messages"); // The existing red Clash styling.
    }
  });

  it("US-29: one Occasion alone says 'in', and a week with two RDOs shows nothing", async () => {
    const { el } = await show([
      { ...trip, end: "2027-03-03", dayTypes: { "2027-03-01": "rdo", "2027-03-02": "rdo", "2027-03-03": "rdo" } },
    ]);
    expect(text(warning(card(el, "Made-up trip"))!).trim()).toBe(
      "Too many RDOs: the week of Sun Feb 28, 2027 has 3 RDOs in 'Made-up trip'. A week only has 2.",
    );
    await mounted!.unmount();
    mounted = null;
    const fine = await show([trip, concert]);
    expect(fine.el.querySelector(".rdo-warning")).toBeNull();
  });

  it("US-29: 'Choose days' warns live while editing and highlights the extra RDO rows, but Save still works", async () => {
    const { el, onChange } = await show([trip, concert]);
    await click(button(card(el, "Made-up trip"), "Choose days"));
    const editor = () => card(el, "Made-up trip").querySelector(".day-editor")!;
    expect(warning(editor())).toBeNull();

    const select = editor().querySelectorAll("select")[0];
    await act(async () => {
      select.value = "rdo";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(text(warning(editor())!).trim()).toBe(
      "Too many RDOs: the week of Sun Feb 28, 2027 has 3 RDOs across 'Made-up trip' and 'Made-up concert'. A week only has 2.",
    );
    const rows = [...editor().querySelectorAll(".day")];
    expect(rows.map((r) => r.classList.contains("too-many-rdos"))).toEqual([true, false]);
    // Nothing is saved until Save, and Save isn't refused: it's a warning.
    expect(onChange).not.toHaveBeenCalled();
    await click(button(card(el, "Made-up trip"), "Save"));
    expect(saved(onChange).find((o) => o.id === "trip")!.dayTypes).toEqual({
      "2027-03-01": "rdo",
      "2027-03-02": "vacation",
    });
    expect(text(warning(card(el, "Made-up trip"))!)).toContain("has 3 RDOs");
  });
});

describe("nudging toward Floating Holidays", () => {
  // Sam's three 2027 Floating Holidays (Jan 1) are free, so they could cover the trip's two Vacation days.
  const note = (el: HTMLElement, name = "Made-up trip") => card(el, name).querySelector(".fh-nudge");

  it("US-26: shows a gentle note when free Floating Holidays could cover Vacation days", async () => {
    const { el } = await show();
    expect(text(note(el)!).trim()).toContain(
      "2 Floating Holidays could cover days here instead of Vacation. They expire Dec 31.",
    );
  });

  it("US-26: 'Use Floating Holidays' switches those days and saves, and the note goes away", async () => {
    const { el, onChange } = await show();
    await click(button(card(el, "Made-up trip"), "Use Floating Holidays"));
    expect(saved(onChange)[0].dayTypes).toEqual({ "2027-03-01": "floatingHoliday", "2027-03-02": "floatingHoliday" });
    expect(note(el)).toBeNull();
  });

  it("US-26: says it in the singular for one day", async () => {
    const { el } = await show([{ ...trip, dayTypes: { "2027-03-01": "vacation", "2027-03-02": "unpaid" } }]);
    expect(text(note(el)!).trim()).toContain(
      "1 Floating Holiday could cover a day here instead of Vacation. It expires Dec 31.",
    );
  });

  it("US-26: switches only as many days as there are free Floating Holidays, earliest first", async () => {
    // Mon Mar 1 – Fri Mar 5, 2027: five Vacation days, three free Floating Holidays.
    const week: Occasion = {
      ...trip,
      end: "2027-03-05",
      dayTypes: Object.fromEntries(["01", "02", "03", "04", "05"].map((d) => [`2027-03-${d}`, "vacation" as const])),
    };
    const { el, onChange } = await show([week]);
    await click(button(card(el, "Made-up trip"), "Use Floating Holidays"));
    expect(saved(onChange)[0].dayTypes).toEqual({
      "2027-03-01": "floatingHoliday",
      "2027-03-02": "floatingHoliday",
      "2027-03-03": "floatingHoliday",
      "2027-03-04": "vacation",
      "2027-03-05": "vacation",
    });
  });

  it("US-26: shows no note when there is no Vacation to cover", async () => {
    const { el } = await show([{ ...trip, dayTypes: { "2027-03-01": "rdo", "2027-03-02": "rdo" } }]);
    expect(note(el)).toBeNull();
  });

  it("US-26: goes through the Clash check, opening the day editor if the switch is refused", async () => {
    // Saved before the Clash check could stop it (say, synced from two devices): Mar 1 is Vacation in both.
    const overlap: Occasion = { id: "overlap", name: "Made-up overlap", start: "2027-03-01", end: "2027-03-01", dayTypes: { "2027-03-01": "vacation" } };
    const { el, onChange } = await show([trip, overlap]);
    await click(button(card(el, "Made-up trip"), "Use Floating Holidays"));
    expect(onChange).not.toHaveBeenCalled();
    expect(text(card(el, "Made-up trip"))).toContain("Mar 1 is already Vacation in 'Made-up overlap'");
    expect(card(el, "Made-up trip").querySelector(".day.clashing")).not.toBeNull();
  });
});
