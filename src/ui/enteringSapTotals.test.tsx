// @vitest-environment jsdom
/**
 * US-28: entering the current SAP totals in Settings, typed the way a person
 * types them, always updates the Ledger and never errors. These render the
 * whole app (Settings beside the Ledger) on local storage, as someone signed
 * out uses it, with the spec's made-up "Sam", and type one keystroke at a time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { sam } from "../engine/fixtures";
import { applyChanges, changesBetween, LocalDataStore, memoryStorage } from "../storage";
import type { AppData, DataStore, StoreState } from "../storage";
import { App } from "./App";
import { field, leave, render, text, typeInto } from "./testDom";
import type { Rendered } from "./testDom";

const TODAY = "2026-11-24";
/** Sam, set up today with nothing in SAP yet. */
const samToday: AppData = { settings: { ...sam, sapAsOf: TODAY }, occasions: [], earnDateEdits: {} };

let mounted: Rendered | null = null;
let errors: unknown[] = [];
beforeEach(() => {
  // Today is Tue Nov 24, 2026. Fake clocks that still tick, so the helpers' 0 ms waits go through.
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date(2026, 10, 24, 10, 0));
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(args));
});
afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function showApp(store: DataStore) {
  mounted = await render(<App store={store} />);
  return mounted.el;
}

async function samOnThisDevice() {
  const storage = memoryStorage();
  await new LocalDataStore(storage).save(samToday);
  const el = await showApp(new LocalDataStore(storage));
  return { el, saved: async () => (await new LocalDataStore(storage).load())! };
}

const hint = (input: HTMLInputElement) =>
  text(document.getElementById(input.getAttribute("aria-describedby") ?? "")!).trim();

/** The "Earned now" card at the top of the Ledger, e.g. "5 Vacation, 2 Floating Holidays". */
function earnedNow(el: HTMLElement) {
  const card = text(el.querySelector(".summary .stat-card")!);
  const [, vacation, floatingHoliday] = /(\d+) Vacation, (\d+) Floating Holiday/.exec(card) ?? [];
  return { vacation: Number(vacation), floatingHoliday: Number(floatingHoliday) };
}

/** Types `keys` one keystroke at a time, calling `after` with what's in the field after each. */
async function typeKeys(input: HTMLInputElement, keys: string, after: (typed: string) => void) {
  for (let i = 1; i <= keys.length; i++) {
    await typeInto(input, keys.slice(0, i));
    after(keys.slice(0, i));
  }
}

const FIELDS = [
  { caption: "SAP Vacation hours", setting: "sapVacationHours", count: "vacation" },
  { caption: "SAP Floating Holiday hours", setting: "sapFloatingHolidayHours", count: "floatingHoliday" },
] as const;

/** What each keystroke should leave: the hours counted and the note under the field. */
const KEYSTROKES: Record<string, { hours: number; note: string }[]> = {
  "4": [{ hours: 4, note: "Counts as 0 days (4 hrs left over, less than a day)" }],
  "44": [
    { hours: 4, note: "Counts as 0 days (4 hrs left over, less than a day)" },
    { hours: 44, note: "Counts as 5 days (4 hrs left over, less than a day)" },
  ],
  "44.5": [
    { hours: 4, note: "Counts as 0 days (4 hrs left over, less than a day)" },
    { hours: 44, note: "Counts as 5 days (4 hrs left over, less than a day)" },
    { hours: 44, note: "Counts as 5 days (4 hrs left over, less than a day)" },
    { hours: 44.5, note: "Counts as 5 days (4.5 hrs left over, less than a day)" },
  ],
  // The decimal keypad shows "," instead of "." in many regions.
  "44,5": [
    { hours: 4, note: "Counts as 0 days (4 hrs left over, less than a day)" },
    { hours: 44, note: "Counts as 5 days (4 hrs left over, less than a day)" },
    { hours: 44, note: "Counts as 5 days (4 hrs left over, less than a day)" },
    { hours: 44.5, note: "Counts as 5 days (4.5 hrs left over, less than a day)" },
  ],
  "37.6": [
    { hours: 3, note: "Counts as 0 days (3 hrs left over, less than a day)" },
    { hours: 37, note: "Counts as 4 days (5 hrs left over, less than a day)" },
    { hours: 37, note: "Counts as 4 days (5 hrs left over, less than a day)" },
    { hours: 37.6, note: "Counts as 4 days (5.6 hrs left over, less than a day)" },
  ],
};

describe("US-28: entering my current SAP totals doesn't break", () => {
  for (const f of FIELDS) {
    for (const [keys, steps] of Object.entries(KEYSTROKES)) {
      it(`US-28: typing "${keys}" into ${f.caption} updates the note and the Ledger after every keystroke`, async () => {
        const { el, saved } = await samOnThisDevice();
        const input = field(el, f.caption);
        await act(async () => input.focus());
        let step = 0;
        await typeKeys(input, keys, (typed) => {
          const { hours, note } = steps[step++];
          expect(input.value).toBe(typed);
          expect(hint(input), `after "${typed}"`).toBe(note);
          expect(earnedNow(el)[f.count], `after "${typed}"`).toBe(Math.floor(hours / 8));
        });
        await leave(input);
        const last = steps.at(-1)!;
        expect(input.value).toBe(String(last.hours));
        expect(hint(input)).toBe(last.note);
        expect(earnedNow(el)[f.count]).toBe(Math.floor(last.hours / 8));
        expect((await saved()).settings[f.setting]).toBe(last.hours);
        expect(errors).toEqual([]);
        expect(el.querySelector(".app-error")).toBeNull();
      });
    }

    it(`US-28: clearing ${f.caption} and leaving it counts as 0`, async () => {
      const { el, saved } = await samOnThisDevice();
      const input = field(el, f.caption);
      await typeKeys(input, "24", () => {});
      expect(earnedNow(el)[f.count]).toBe(3);
      await typeInto(input, "2");
      await typeInto(input, "");
      expect(earnedNow(el)[f.count]).toBe(0);
      await leave(input);
      expect(input.value).toBe("0");
      expect(hint(input)).toBe("Counts as 0 days");
      expect(earnedNow(el)[f.count]).toBe(0);
      expect((await saved()).settings[f.setting]).toBe(0);
      expect(errors).toEqual([]);
    });

    it(`US-28: pasting 99999 into ${f.caption} clamps to 2,000 hours when I leave it`, async () => {
      const { el, saved } = await samOnThisDevice();
      const input = field(el, f.caption);
      await typeInto(input, "99999");
      // Out of range while still in the field: nothing is saved, and the Ledger stays as it was.
      expect(earnedNow(el)[f.count]).toBe(0);
      await leave(input);
      expect(input.value).toBe("2000");
      expect(hint(input)).toBe("Counts as 250 days");
      expect(earnedNow(el)[f.count]).toBe(250);
      expect((await saved()).settings[f.setting]).toBe(2000);
      expect(errors).toEqual([]);
    });

    it(`US-28: a leading 0 in ${f.caption} counts as the number after it`, async () => {
      const { el, saved } = await samOnThisDevice();
      const input = field(el, f.caption);
      await typeKeys(input, "040", () => {});
      expect(earnedNow(el)[f.count]).toBe(5);
      await leave(input);
      expect(input.value).toBe("40");
      expect(hint(input)).toBe("Counts as 5 days");
      expect((await saved()).settings[f.setting]).toBe(40);
    });

    it(`US-28: a trailing "." left in ${f.caption} keeps the number before it`, async () => {
      const { el, saved } = await samOnThisDevice();
      const input = field(el, f.caption);
      await typeKeys(input, "40.", () => {});
      expect(earnedNow(el)[f.count]).toBe(5);
      await leave(input);
      expect(input.value).toBe("40");
      expect(hint(input)).toBe("Counts as 5 days");
      expect(earnedNow(el)[f.count]).toBe(5);
      expect((await saved()).settings[f.setting]).toBe(40);
      expect(errors).toEqual([]);
    });

    it(`US-28: a slip of the keyboard in ${f.caption} never wipes the balance`, async () => {
      const { el, saved } = await samOnThisDevice();
      const input = field(el, f.caption);
      await typeKeys(input, "40", () => {});
      await typeInto(input, "40w");
      expect(earnedNow(el)[f.count]).toBe(5);
      await leave(input);
      expect(input.value).toBe("40");
      expect((await saved()).settings[f.setting]).toBe(40);
      expect(errors).toEqual([]);
    });
  }
});

/**
 * Stands in for the account's store, like App.test's `rawStore`: it keeps
 * what's saved, and hands each save back as a snapshot only when the test
 * says, as Firestore's snapshots can arrive after the next keystroke.
 */
function signedInStore(initial: AppData) {
  let stored = initial;
  let listener: ((s: StoreState) => void) | null = null;
  const echoes: AppData[] = [];
  const store: DataStore = {
    load: async () => stored,
    save: async (data) => void (stored = data),
    update: async (before, after) => {
      stored = applyChanges(stored, changesBetween(before, after));
      echoes.push(stored);
    },
    clear: async () => {},
    synced: async () => {},
    subscribe(onChange) {
      listener = onChange;
      queueMicrotask(() => onChange({ data: stored, unsynced: false, notKept: false }));
      return () => void (listener = null);
    },
  };
  return {
    store,
    stored: () => stored,
    /** Hands back the oldest save not yet echoed. */
    echoOne: () => act(async () => listener?.({ data: echoes.shift()!, unsynced: true, notKept: false })),
    echoAll: async () => {
      while (echoes.length) await act(async () => listener?.({ data: echoes.shift()!, unsynced: false, notKept: false }));
    },
  };
}

describe("US-28: signed in, late snapshots don't fight my typing", () => {
  it("US-28: the field keeps what I typed while the account echoes earlier keystrokes back", async () => {
    const account = signedInStore(samToday);
    const el = await showApp(account.store);
    const input = field(el, "SAP Vacation hours");
    await act(async () => input.focus());

    await typeKeys(input, "44.5", () => {});
    // The echoes of "4" and "44" arrive after "44.5" is in the field.
    await account.echoOne();
    expect(input.value).toBe("44.5");
    await account.echoOne();
    expect(input.value).toBe("44.5");
    await account.echoAll();
    expect(input.value).toBe("44.5");
    expect(hint(input)).toBe("Counts as 5 days (4.5 hrs left over, less than a day)");
    expect(earnedNow(el).vacation).toBe(5);

    // Keep typing after a stale echo: nothing typed is lost.
    await typeInto(input, "44.56");
    await account.echoAll();
    await leave(input);
    expect(input.value).toBe("44.56");
    expect(account.stored().settings.sapVacationHours).toBe(44.56);
    expect(earnedNow(el).vacation).toBe(5);
    expect(errors).toEqual([]);
  });

  it("US-28: an echo of an earlier keystroke arriving mid-typing never ends up saved", async () => {
    const account = signedInStore(samToday);
    const el = await showApp(account.store);
    const input = field(el, "SAP Floating Holiday hours");
    await act(async () => input.focus());
    await typeInto(input, "1");
    await typeInto(input, "16");
    await account.echoOne(); // "1", late
    await typeInto(input, "160");
    await account.echoAll();
    await leave(input);
    expect(input.value).toBe("160");
    expect(account.stored().settings.sapFloatingHolidayHours).toBe(160);
    expect(earnedNow(el).floatingHoliday).toBe(20);
  });
});
