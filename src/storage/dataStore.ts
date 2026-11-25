import { isSupportedDate } from "../engine";
import type { DayType, EarnDateEdits, IsoDate, Occasion, Settings, Weekday } from "../engine";

/** Everything a person saves: the engine's input minus today. */
export interface AppData {
  settings: Settings;
  occasions: Occasion[];
  earnDateEdits: EarnDateEdits;
}

/** What Settings accepts. Anything outside is clamped, on entry and on load. */
export const WEEKLY_HOURS = { min: 1, max: 80 } as const;
export const BALANCE_HOURS = { min: 0, max: 2000 } as const;

/** What a store holds right now, as `DataStore.subscribe` reports it. */
export interface StoreState {
  /** Null when nothing is saved yet. */
  data: AppData | null;
  /** Edits on this device that haven't reached the account yet (offline, or still sending). */
  unsynced: boolean;
  /**
   * This browser won't keep the data (storage blocked or full), so edits only
   * last until the page closes.
   */
  notKept: boolean;
}

/**
 * Where AppData lives: LocalDataStore while signed out, FirestoreDataStore
 * (`users/{uid}`) while signed in. See src/auth/sync.ts for moving between them.
 *
 * Writes resolve once the change is on this device. The account's store sends
 * it to the server when it can, which may be much later offline; a failure
 * there is reported through `subscribe`'s `onError`.
 */
export interface DataStore {
  /** Null on first run (nothing saved yet). Throws NewerDataError for data saved by a newer app. */
  load(): Promise<AppData | null>;
  /** Replaces everything this store holds with `data` (the first-sign-in handoff). Never merges. */
  save(data: AppData): Promise<void>;
  /** Removes this store's copy ("Sign out" / "Delete my data"). */
  clear(): Promise<void>;
}

/** The saved data comes from a newer version of the app, which this one mustn't overwrite. */
export class NewerDataError extends Error {
  constructor() {
    super("Your data was saved by a newer version of Time Off Tracker. Reload the page to update the app.");
    this.name = "NewerDataError";
  }
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

const DAY_TYPES: readonly DayType[] = ["rdo", "floatingHoliday", "vacation", "unpaid"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function clamp(value: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, value));
}

const dateOrNull = (v: unknown): IsoDate | null => (isSupportedDate(v) ? v : null);

/**
 * Turns whatever was saved (an older shape, a damaged or hand-edited copy)
 * into AppData the engine can always run on: anything added since gets its
 * default, numbers are clamped to what Settings accepts, dates must be real
 * and from 1950 to 2100, and unusable entries are dropped.
 */
export function withDefaults(data: Partial<AppData>): AppData {
  const raw: Record<string, unknown> = isRecord(data) ? data : {};
  return {
    settings: settingsFrom(raw.settings),
    occasions: occasionsFrom(raw.occasions),
    earnDateEdits: earnDateEditsFrom(raw.earnDateEdits),
  };
}

function settingsFrom(value: unknown): Settings {
  const s = isRecord(value) ? value : {};
  const defaults = emptyAppData().settings;
  const days = Array.isArray(s.regularDaysOff) ? s.regularDaysOff : [];
  return {
    hireDate: dateOrNull(s.hireDate),
    weeklyHours: clamp(s.weeklyHours, WEEKLY_HOURS, defaults.weeklyHours),
    regularDaysOff: [...new Set(days)]
      .filter((d): d is Weekday => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)
      .sort((a, b) => a - b),
    sapVacationHours: clamp(s.sapVacationHours, BALANCE_HOURS, defaults.sapVacationHours),
    sapFloatingHolidayHours: clamp(s.sapFloatingHolidayHours, BALANCE_HOURS, defaults.sapFloatingHolidayHours),
    sapAsOf: dateOrNull(s.sapAsOf),
    fullYearHistory: s.fullYearHistory === true,
  };
}

function occasionsFrom(value: unknown): Occasion[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const occasions: Occasion[] = [];
  for (const o of value) {
    if (!isRecord(o) || typeof o.id !== "string" || o.id === "" || seen.has(o.id)) continue;
    if (!isSupportedDate(o.start) || !isSupportedDate(o.end)) continue;
    const [start, end] = o.start <= o.end ? [o.start, o.end] : [o.end, o.start];
    const dayTypes: Record<IsoDate, DayType> = {};
    if (isRecord(o.dayTypes)) {
      for (const [date, type] of Object.entries(o.dayTypes)) {
        if (date >= start && date <= end && isSupportedDate(date) && DAY_TYPES.includes(type as DayType)) {
          dayTypes[date] = type as DayType;
        }
      }
    }
    seen.add(o.id);
    occasions.push({ id: o.id, name: typeof o.name === "string" ? o.name : "", start, end, dayTypes });
  }
  return occasions;
}

function earnDateEditsFrom(value: unknown): EarnDateEdits {
  if (!isRecord(value)) return {};
  const edits: EarnDateEdits = {};
  for (const [key, date] of Object.entries(value)) if (key !== "" && isSupportedDate(date)) edits[key] = date;
  return edits;
}

/** True when two AppData values hold the same data, whatever their key or Occasion order. */
export function sameAppData(a: AppData, b: AppData): boolean {
  return canonical(a) === canonical(b);
}

/** True for data that was never filled in, which counts as nothing saved. */
export function isEmptyAppData(data: AppData): boolean {
  return sameAppData(data, emptyAppData());
}

function canonical(data: AppData): string {
  const occasions = [...data.occasions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({ ...data, occasions }, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
