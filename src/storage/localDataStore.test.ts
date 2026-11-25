import { describe, expect, it } from "vitest";
import { emptyAppData, LocalDataStore } from "./index";
import type { AppData, KeyValueStorage } from "./index";
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

const samData: AppData = {
  settings: { ...sam, sapVacationHours: 40, sapAsOf: "2025-11-24" },
  occasions: [],
  earnDateEdits: {},
};

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
});

describe("emptyAppData", () => {
  it("defaults to 40 weekly hours with full-year history off", () => {
    const { settings } = emptyAppData();
    expect(settings.weeklyHours).toBe(40);
    expect(settings.fullYearHistory).toBe(false);
    expect(settings.hireDate).toBeNull();
  });
});
