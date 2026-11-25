import type { EarnDateEdits, Occasion, Settings } from "../engine";

/** Everything a person saves: the engine's input minus today. */
export interface AppData {
  settings: Settings;
  occasions: Occasion[];
  earnDateEdits: EarnDateEdits;
}

/**
 * Where AppData lives: LocalDataStore while signed out, FirestoreDataStore
 * (`users/{uid}`) while signed in. See src/auth/sync.ts for moving between them.
 */
export interface DataStore {
  /** Null on first run (nothing saved yet). */
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
  /** Removes this store's copy ("Sign out" / "Delete my data"). */
  clear(): Promise<void>;
}

export function emptyAppData(): AppData {
  return {
    settings: {
      hireDate: null,
      weeklyHours: 40,
      regularDaysOff: [],
      sapVacationHours: 0,
      sapFloatingHolidayHours: 0,
      sapAsOf: null,
      fullYearHistory: false,
    },
    occasions: [],
    earnDateEdits: {},
  };
}

/** Fills anything added since the data was saved with its default. */
export function withDefaults(data: Partial<AppData>): AppData {
  const empty = emptyAppData();
  return {
    settings: { ...empty.settings, ...data.settings },
    occasions: data.occasions ?? empty.occasions,
    earnDateEdits: data.earnDateEdits ?? empty.earnDateEdits,
  };
}

/** True when two AppData values hold the same data, whatever their key order. */
export function sameAppData(a: AppData, b: AppData): boolean {
  return canonical(a) === canonical(b);
}

/** True for data that was never filled in, which counts as nothing saved. */
export function isEmptyAppData(data: AppData): boolean {
  return sameAppData(data, emptyAppData());
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
