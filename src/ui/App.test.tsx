// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { LocalDataStore, memoryStorage } from "../storage";
import type { AppData, KeyValueStorage } from "../storage";
import { sam } from "../engine/fixtures";
import { App } from "./App";
import { click, field, render, text, typeInto, weekday } from "./testDom";
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
    await click(weekday(tabB.el, "Mon"));

    const saved = (await new LocalDataStore(storage).load())!;
    expect(saved.settings.weeklyHours).toBe(32);
    expect(saved.settings.regularDaysOff).toEqual([0, 1, 6]);
  });
});
