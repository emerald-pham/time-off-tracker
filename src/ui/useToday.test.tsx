// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { LocalDataStore, memoryStorage } from "../storage";
import type { AppData } from "../storage";
import { sam } from "../engine/fixtures";
import { App } from "./App";
import { field, render, text, typeInto } from "./testDom";
import type { Rendered } from "./testDom";
import { useToday } from "./useToday";

function Today() {
  return <p>Today is {useToday()}</p>;
}

let mounted: Rendered | null = null;
beforeEach(() => {
  // Fake clocks that still tick, so the 0 ms waits the helpers use go through.
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
  vi.useRealTimers();
});

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min);
const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

describe("useToday (finding 17)", () => {
  it("moves on at midnight while the page stays open", async () => {
    vi.setSystemTime(at(2026, 11, 24, 23, 59));
    mounted = await render(<Today />);
    expect(text(mounted.el)).toContain("2026-11-24");
    await advance(2 * 60_000);
    expect(text(mounted.el)).toContain("2026-11-25");
  });

  it("catches up when the page comes back after the device slept", async () => {
    vi.setSystemTime(at(2026, 11, 24, 10, 0));
    mounted = await render(<Today />);
    vi.setSystemTime(at(2026, 11, 26, 8, 0)); // no timers ran while asleep
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    expect(text(mounted.el)).toContain("2026-11-26");
  });

  it("catches up when the window gets focus again", async () => {
    vi.setSystemTime(at(2026, 11, 24, 10, 0));
    mounted = await render(<Today />);
    vi.setSystemTime(at(2026, 11, 25, 9, 0));
    await act(async () => void window.dispatchEvent(new Event("focus")));
    expect(text(mounted.el)).toContain("2026-11-25");
  });
});

const configured: AppData = {
  settings: { ...sam, sapVacationHours: 40, sapAsOf: "2026-11-01" },
  occasions: [],
  earnDateEdits: {},
};

async function app(saved: AppData) {
  const storage = memoryStorage();
  await new LocalDataStore(storage).save(saved);
  mounted = await render(<App store={new LocalDataStore(storage)} />);
  return { el: mounted.el, stored: () => new LocalDataStore(storage).load() };
}

describe("the app's today", () => {
  it("stamps a balance change with the new day after midnight", async () => {
    vi.setSystemTime(at(2026, 11, 24, 23, 59));
    const { el, stored } = await app(configured);
    await advance(2 * 60_000);
    await typeInto(field(el, "SAP Vacation hours"), "48");
    expect((await stored())?.settings.sapAsOf).toBe("2026-11-25");
  });

  it("gives an older save with a hire date but no as-of date today's date, once (finding 15)", async () => {
    vi.setSystemTime(at(2026, 11, 24, 12, 0));
    const { stored } = await app({ ...configured, settings: { ...configured.settings, sapAsOf: null } });
    expect((await stored())?.settings.sapAsOf).toBe("2026-11-24");
  });
});
