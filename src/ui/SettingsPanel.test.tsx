// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import type { Settings } from "../engine";
import { sam } from "../engine/fixtures";
import { SettingsPanel } from "./SettingsPanel";
import { field, leave, render, typeInto } from "./testDom";
import type { Rendered } from "./testDom";

const TODAY = "2026-11-24";

/** SettingsPanel as the app uses it: it re-renders with whatever was last saved. */
function harness(initial: Settings) {
  const saves: Settings[] = [];
  function Harness() {
    const [settings, setSettings] = useState(initial);
    return (
      <SettingsPanel
        settings={settings}
        today={TODAY}
        onChange={(next) => {
          saves.push(next);
          setSettings(next);
        }}
      />
    );
  }
  return { saves, Harness, last: () => saves.at(-1) };
}

let mounted: Rendered | null = null;
afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
});

async function show(initial: Settings) {
  const h = harness(initial);
  mounted = await render(<h.Harness />);
  return { ...h, el: mounted.el };
}

const configured: Settings = { ...sam, sapVacationHours: 40, sapAsOf: "2026-11-01" };

describe("US-25: the weekly rule replaces regular days off", () => {
  it("US-25: Settings no longer asks for regular days off, and keeps the stored ones untouched", async () => {
    const { el, saves, last } = await show(configured);
    expect(el.textContent).not.toMatch(/regular days off/i);
    expect(el.querySelectorAll('input[type="checkbox"]').length).toBe(1); // Full-year history only.
    await typeInto(field(el, "Weekly hours"), "32");
    expect(saves.length).toBeGreaterThan(0);
    expect(last()!.regularDaysOff).toEqual([0, 6]);
  });
});

describe("number fields stay in range (finding 9)", () => {
  it("never saves weekly hours below 1, and keeps 1 when that's what's left", async () => {
    const { el, saves, last } = await show(configured);
    const hours = field(el, "Weekly hours");
    await typeInto(hours, "0.00002");
    expect(saves.some((s) => s.weeklyHours < 1)).toBe(false);
    await leave(hours);
    expect(last()?.weeklyHours).toBe(1);
    expect(hours.value).toBe("1");
  });

  it("keeps weekly hours at most 80", async () => {
    const { el, last } = await show(configured);
    const hours = field(el, "Weekly hours");
    await typeInto(hours, "500");
    await leave(hours);
    expect(last()?.weeklyHours).toBe(80);
  });

  it("keeps SAP balances at most 2,000 hours", async () => {
    const { el, saves, last } = await show(configured);
    const balance = field(el, "SAP Vacation hours");
    await typeInto(balance, "4000000");
    expect(saves.some((s) => s.sapVacationHours > 2000)).toBe(false);
    await leave(balance);
    expect(last()?.sapVacationHours).toBe(2000);
  });

  it("saves a value in range as it's typed", async () => {
    const { el, last } = await show(configured);
    await typeInto(field(el, "Weekly hours"), "32");
    expect(last()?.weeklyHours).toBe(32);
  });
});

describe("SAP hours fields say what the app counts", () => {
  const hint = (input: HTMLInputElement) =>
    document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent;

  it("US-04: shows whole days under each balance, and any hours left over", async () => {
    const { el } = await show({ ...configured, sapVacationHours: 43, sapFloatingHolidayHours: 8 });
    expect(hint(field(el, "SAP Vacation hours"))).toBe("Counts as 5 days (3 hrs left over, less than a day)");
    expect(hint(field(el, "SAP Floating Holiday hours"))).toBe("Counts as 1 day");
  });

  it("follows the balance as it's typed", async () => {
    const { el } = await show(configured);
    const balance = field(el, "SAP Vacation hours");
    await typeInto(balance, "20");
    expect(hint(balance)).toBe("Counts as 2 days (4 hrs left over, less than a day)");
  });
});

describe("clearing a number field (finding 18)", () => {
  it("saves 0 for a balance left blank", async () => {
    const { el, last } = await show(configured);
    const balance = field(el, "SAP Vacation hours");
    await typeInto(balance, "");
    await leave(balance);
    expect(last()).toMatchObject({ sapVacationHours: 0, sapAsOf: TODAY });
    expect(balance.value).toBe("0");
  });

  it("puts back the saved weekly hours when left blank", async () => {
    const { el, saves } = await show(configured);
    const hours = field(el, "Weekly hours");
    await typeInto(hours, "");
    await leave(hours);
    expect(saves).toEqual([]);
    expect(hours.value).toBe("40");
  });
});

describe("the SAP Balance as-of date is always a real date (finding 15)", () => {
  it("is set to today when the hire date is first entered", async () => {
    const { el, last } = await show({ ...sam, hireDate: null, sapAsOf: null });
    await typeInto(field(el, "Hire date"), "2024-08-14");
    expect(last()).toMatchObject({ hireDate: "2024-08-14", sapAsOf: TODAY });
  });

  it("isn't moved when the hire date changes later", async () => {
    const { el, last } = await show(configured);
    await typeInto(field(el, "Hire date"), "2024-09-01");
    expect(last()).toMatchObject({ hireDate: "2024-09-01", sapAsOf: "2026-11-01" });
  });

  it("can't be cleared", async () => {
    const { el, saves } = await show(configured);
    const asOf = field(el, "SAP Balance as-of date");
    await typeInto(asOf, "");
    await leave(asOf);
    expect(saves).toEqual([]);
    expect(asOf.value).toBe("2026-11-01");
  });
});

/** Like `show`, but a test can also deliver stored settings, as a late snapshot does. */
async function showWithEchoes(initial: Settings) {
  let deliver: (s: Settings) => void = () => {};
  const saves: Settings[] = [];
  function Harness() {
    const [settings, setSettings] = useState(initial);
    deliver = setSettings;
    return (
      <SettingsPanel
        settings={settings}
        today={TODAY}
        onChange={(next) => {
          saves.push(next);
          setSettings(next);
        }}
      />
    );
  }
  mounted = await render(<Harness />);
  return {
    el: mounted.el,
    saves,
    echo: (s: Settings) => act(async () => deliver(s)),
  };
}

describe("a field someone is typing in isn't rewritten by a late snapshot", () => {
  it("an older save's echo doesn't change the number being typed", async () => {
    const { el, saves, echo } = await showWithEchoes(configured);
    const balance = field(el, "SAP Vacation hours");
    await typeInto(balance, "12");
    await typeInto(balance, "123");
    await echo({ ...configured, sapVacationHours: 12, sapAsOf: TODAY }); // the "12" save, arriving late
    expect(balance.value).toBe("123");
    await typeInto(balance, "1234");
    expect(saves.at(-1)?.sapVacationHours).toBe(1234);
  });

  it("an older save's echo doesn't change the date being typed", async () => {
    const { el, echo } = await showWithEchoes(configured);
    const hire = field(el, "Hire date");
    await typeInto(hire, "2024-08-15");
    await echo(configured); // still the old hire date
    expect(hire.value).toBe("2024-08-15");
  });

  it("shows another device's change once the field is left, without writing the old value back", async () => {
    const { el, saves, echo } = await showWithEchoes(configured);
    const hours = field(el, "Weekly hours");
    await act(async () => hours.focus());
    await echo({ ...configured, weeklyHours: 32 });
    expect(hours.value).toBe("40");
    await leave(hours);
    expect(hours.value).toBe("32");
    expect(saves).toEqual([]);
  });
});

describe("dates are saved only once they're real and between 1950 and 2100 (finding 16)", () => {
  it("doesn't save the partial years a date field passes through while typing", async () => {
    const { el, saves, last } = await show(configured);
    const hire = field(el, "Hire date");
    for (const partial of ["0002-08-14", "0020-08-14", "0202-08-14"]) await typeInto(hire, partial);
    expect(saves).toEqual([]);
    await typeInto(hire, "2024-08-15");
    expect(last()?.hireDate).toBe("2024-08-15");
  });

  it("puts the saved date back if the field is left on an unsupported one", async () => {
    const { el, saves } = await show(configured);
    const asOf = field(el, "SAP Balance as-of date");
    await typeInto(asOf, "2150-01-01");
    await leave(asOf);
    expect(saves).toEqual([]);
    expect(asOf.value).toBe("2026-11-01");
    expect([asOf.min, asOf.max]).toEqual(["1950-01-01", "2100-12-31"]);
  });
});
