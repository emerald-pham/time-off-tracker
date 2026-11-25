import { describe, expect, it, vi } from "vitest";
import { emptyAppData, LocalDataStore, NewerDataError } from "./index";
import type { AppData, KeyValueStorage, StoreState } from "./index";
import { sam } from "../engine/fixtures";

function memoryStorage(): KeyValueStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (k) => raw.get(k) ?? null,
    setItem: (k, v) => void raw.set(k, v),
    removeItem: (k) => void raw.delete(k),
  };
}

/** Storage the browser refuses, as in some private-browsing modes or with storage blocked. */
function refusingStorage(): KeyValueStorage {
  const refuse = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

const samData: AppData = {
  settings: { ...sam, sapVacationHours: 40, sapAsOf: "2025-11-24" },
  occasions: [],
  earnDateEdits: {},
};

const trip = { id: "trip", name: "Made-up trip", start: "2026-06-01", end: "2026-06-03", dayTypes: {} };
const visit = { id: "visit", name: "Made-up visit", start: "2026-08-10", end: "2026-08-10", dayTypes: {} };

/** Collects what `subscribe` reports. */
function watchStore(store: LocalDataStore) {
  const states: StoreState[] = [];
  const errors: Error[] = [];
  const stop = store.subscribe(
    (s) => states.push(s),
    (e) => errors.push(e),
  );
  return { states, errors, stop, latest: () => states.at(-1) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("LocalDataStore", () => {
  it("loads nothing on first run", async () => {
    expect(await new LocalDataStore(memoryStorage()).load()).toBeNull();
  });

  it("loads what it saved", async () => {
    const storage = memoryStorage();
    await new LocalDataStore(storage).save(samData);
    expect(await new LocalDataStore(storage).load()).toEqual(samData);
  });

  it("forgets everything on clear", async () => {
    const storage = memoryStorage();
    const store = new LocalDataStore(storage);
    await store.save(samData);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("treats unreadable data as a first run", async () => {
    const storage = memoryStorage();
    storage.raw.set("time-off-tracker", "{not json");
    expect(await new LocalDataStore(storage).load()).toBeNull();
  });

  it("fills settings added since the data was saved with their defaults", async () => {
    const storage = memoryStorage();
    storage.raw.set(
      "time-off-tracker",
      JSON.stringify({ version: 1, data: { settings: { hireDate: "2024-08-14" } } }),
    );
    const loaded = await new LocalDataStore(storage).load();
    expect(loaded).toEqual({
      ...emptyAppData(),
      settings: { ...emptyAppData().settings, hireDate: "2024-08-14" },
    });
  });

  describe("two tabs editing at once", () => {
    // Each tab edits the copy it loaded; neither has seen the other's edit.
    async function twoTabs(initial: AppData) {
      const storage = memoryStorage();
      await new LocalDataStore(storage).save(initial);
      return { a: new LocalDataStore(storage), b: new LocalDataStore(storage), storage };
    }

    it("keeps both tabs' Occasions", async () => {
      const base = { ...samData, occasions: [trip] };
      const { a, b } = await twoTabs(base);
      await a.update(base, { ...base, occasions: [trip, visit] });
      await b.update(base, { ...base, occasions: [{ ...trip, name: "Renamed trip" }] });
      const saved = await a.load();
      expect(saved?.occasions.map((o) => o.name).sort()).toEqual(["Made-up visit", "Renamed trip"]);
    });

    it("keeps both tabs' settings when they change different ones", async () => {
      const { a, b } = await twoTabs(samData);
      await a.update(samData, { ...samData, settings: { ...samData.settings, weeklyHours: 32 } });
      await b.update(samData, { ...samData, settings: { ...samData.settings, regularDaysOff: [1, 2] } });
      expect((await a.load())?.settings).toMatchObject({ weeklyHours: 32, regularDaysOff: [1, 2] });
    });

    it("keeps one tab's new Earn Date edit when the other resets a different one", async () => {
      const base = { ...samData, earnDateEdits: { "vacation:2026:2": "2026-03-01" } };
      const { a, b } = await twoTabs(base);
      await a.update(base, { ...base, earnDateEdits: { ...base.earnDateEdits, "vacation:2026:1": "2026-02-03" } });
      await b.update(base, { ...base, earnDateEdits: {} });
      expect((await a.load())?.earnDateEdits).toEqual({ "vacation:2026:1": "2026-02-03" });
    });

    it("a deleted Occasion stays deleted when the other tab edits something else", async () => {
      const base = { ...samData, occasions: [trip, visit] };
      const { a, b } = await twoTabs(base);
      await a.update(base, { ...base, occasions: [visit] });
      await b.update(base, { ...base, settings: { ...base.settings, weeklyHours: 36 } });
      expect((await a.load())?.occasions.map((o) => o.id)).toEqual(["visit"]);
    });
  });

  describe("data saved by a newer version of the app", () => {
    const newer = () => {
      const storage = memoryStorage();
      storage.raw.set("time-off-tracker", JSON.stringify({ version: 2, data: { settings: { hireDate: "2024-08-14" } } }));
      return storage;
    };

    it("won't load as if it were this version's", async () => {
      await expect(new LocalDataStore(newer()).load()).rejects.toBeInstanceOf(NewerDataError);
    });

    it("is never overwritten", async () => {
      const storage = newer();
      const before = storage.raw.get("time-off-tracker");
      const store = new LocalDataStore(storage);
      await expect(store.update(emptyAppData(), samData)).rejects.toBeInstanceOf(NewerDataError);
      await expect(store.save(samData)).rejects.toBeInstanceOf(NewerDataError);
      expect(storage.raw.get("time-off-tracker")).toBe(before);
    });

    it("is reported to subscribers as an error", async () => {
      const watched = watchStore(new LocalDataStore(newer()));
      await settle();
      expect(watched.errors[0]).toBeInstanceOf(NewerDataError);
    });
  });

  describe("when the browser refuses storage", () => {
    it("keeps working in memory instead of failing", async () => {
      const store = new LocalDataStore(refusingStorage());
      expect(await store.load()).toBeNull();
      await store.update(emptyAppData(), samData);
      expect(await store.load()).toEqual(samData);
    });

    it("also copes when even reaching storage throws", async () => {
      const store = new LocalDataStore(() => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      });
      await store.save(samData);
      expect(await store.load()).toEqual(samData);
    });

    it("tells subscribers the data won't be kept", async () => {
      const store = new LocalDataStore(refusingStorage());
      const watched = watchStore(store);
      await store.update(emptyAppData(), samData);
      await settle();
      expect(watched.latest()).toEqual({ data: samData, unsynced: false, notKept: true });
    });
  });

  describe("subscribe", () => {
    it("reports what's saved, then each edit made here", async () => {
      const store = new LocalDataStore(memoryStorage());
      const watched = watchStore(store);
      await settle();
      await store.update(emptyAppData(), samData);
      expect(watched.states.map((s) => s.data)).toEqual([null, samData]);
      expect(watched.latest()).toMatchObject({ unsynced: false, notKept: false });
    });

    it("picks up another tab's edit when the browser says storage changed", async () => {
      const storage = memoryStorage();
      let storageChanged = () => {};
      const watch = vi.fn((_key: string, onChange: () => void) => {
        storageChanged = onChange;
        return () => {};
      });
      const here = new LocalDataStore(storage, { watch });
      const watched = watchStore(here);
      await settle();
      await new LocalDataStore(storage).save(samData); // the other tab
      storageChanged();
      expect(watch).toHaveBeenCalledWith("time-off-tracker", expect.any(Function));
      expect(watched.latest()?.data).toEqual(samData);
    });

    it("stops reporting after unsubscribe", async () => {
      const store = new LocalDataStore(memoryStorage());
      const watched = watchStore(store);
      await settle();
      watched.stop();
      await store.save(samData);
      expect(watched.states.map((s) => s.data)).toEqual([null]);
    });
  });
});

describe("emptyAppData", () => {
  it("defaults to 40 weekly hours with full-year history off", () => {
    const { settings } = emptyAppData();
    expect(settings.weeklyHours).toBe(40);
    expect(settings.fullYearHistory).toBe(false);
    expect(settings.hireDate).toBeNull();
  });
});
