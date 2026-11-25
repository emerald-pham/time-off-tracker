// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { LocalDataStore, memoryStorage, NewerDataError } from "../storage";
import type { AppData, DataStore, KeyValueStorage } from "../storage";
import { sam } from "../engine/fixtures";
import { App } from "./App";
import { button, field, render, text, typeInto } from "./testDom";
import type { Rendered } from "./testDom";

const samData: AppData = {
  settings: { ...sam, sapVacationHours: 40, sapAsOf: "2025-11-24" },
  occasions: [],
  earnDateEdits: {},
};
const trip = { id: "trip", name: "Made-up trip", start: "2026-06-01", end: "2026-06-03", dayTypes: {} };

const mounted: Rendered[] = [];
async function show(store: LocalDataStore) {
  const r = await render(<App store={store} />);
  mounted.push(r);
  return r;
}
afterEach(async () => {
  while (mounted.length) await mounted.pop()!.unmount();
});

async function seeded(data: AppData): Promise<KeyValueStorage> {
  const storage = memoryStorage();
  await new LocalDataStore(storage).save(data);
  return storage;
}

/** A store that reports whatever a test hands it, skipping the checks real stores make on load. */
function rawStore(report: (s: { onChange: (data: AppData) => void; onError: (e: Error) => void }) => void): DataStore {
  return {
    load: async () => null,
    save: async () => {},
    update: async () => {},
    clear: async () => {},
    synced: async () => {},
    subscribe(onChange, onError) {
      queueMicrotask(() =>
        report({ onChange: (data) => onChange({ data, unsynced: false, notKept: false }), onError }),
      );
      return () => {};
    },
  };
}

const account = <section aria-label="Account">Account section here</section>;

describe("App never leaves a blank page (finding 8)", () => {
  it("shows Settings and Account when the Ledger can't be worked out", async () => {
    // 0.00002 weekly hours made the engine throw a RangeError before saves were checked.
    const broken = { ...samData, settings: { ...samData.settings, weeklyHours: 0.00002 } };
    const r = await render(<App store={rawStore(({ onChange }) => onChange(broken))} account={account} />);
    mounted.push(r);
    expect(text(r.el)).toContain("Couldn't work out your Ledger");
    expect(field(r.el, "Weekly hours")).toBeTruthy();
    expect(text(r.el)).toContain("Account section here");
  });

  it("shows why the data couldn't load, with the Account section, instead of nothing", async () => {
    const r = await render(
      <App store={rawStore(({ onError }) => onError(new NewerDataError()))} account={account} />,
    );
    mounted.push(r);
    expect(text(r.el)).toContain("saved by a newer version");
    expect(text(r.el)).toContain("Account section here");
    expect(button(r.el, "Reload")).toBeTruthy();
  });

  it("shows that it's loading rather than nothing", async () => {
    const r = await render(<App store={rawStore(() => {})} account={account} />);
    mounted.push(r);
    expect(text(r.el)).toContain("Loading");
  });

  it("warns when the browser won't keep the data", async () => {
    const refused = new LocalDataStore(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    const r = await show(refused);
    expect(text(r.el)).toContain("isn't letting the app save");
  });
});

describe("App stays live with what's stored (finding 1)", () => {
  it("shows another tab's new Occasion without a reload", async () => {
    const storage = await seeded(samData);
    let storageChanged = () => {};
    const store = new LocalDataStore(storage, {
      watch: (_key, onChange) => {
        storageChanged = onChange;
        return () => {};
      },
    });
    const { el } = await show(store);
    expect(text(el)).not.toContain("Made-up trip");

    await new LocalDataStore(storage).update(samData, { ...samData, occasions: [trip] });
    await act(async () => storageChanged());
    expect(text(el)).toContain("Made-up trip");
  });

  it("an edit in one tab doesn't undo another tab's edit to something else", async () => {
    // Neither tab hears about the other's edit, like a tab left open in the background.
    const storage = await seeded(samData);
    const tabA = await show(new LocalDataStore(storage));
    const tabB = await show(new LocalDataStore(storage));

    await typeInto(field(tabA.el, "Weekly hours"), "32");
    await typeInto(field(tabB.el, "SAP Floating Holiday hours"), "16");

    const saved = (await new LocalDataStore(storage).load())!;
    expect(saved.settings.weeklyHours).toBe(32);
    expect(saved.settings.sapFloatingHolidayHours).toBe(16);
  });
});
