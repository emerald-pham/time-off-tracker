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
  /**
   * Saves an edit made on `before`: writes only the settings, Occasions and
   * Earn Date edits that differ in `after`, so changes made meanwhile on
   * another tab or device to anything else survive.
   */
  update(before: AppData, after: AppData): Promise<void>;
  /** Removes this store's copy ("Sign out" / "Delete my data"). */
  clear(): Promise<void>;
  /**
   * Resolves once every write made through this store has reached where it's
   * kept (the server, for the account, which waits until it's online).
   * Rejects if the last one was refused.
   */
  synced(): Promise<void>;
  /**
   * Calls `onChange` with what's stored now, then after every change made
   * here or on another tab or device. Returns the unsubscribe.
   */
  subscribe(onChange: (state: StoreState) => void, onError: (error: Error) => void): () => void;
}

/** The saved data comes from a newer version of the app, which this one mustn't overwrite. */
export class NewerDataError extends Error {
  constructor() {
    super("Your data was saved by a newer version of Time Off Tracker. Reload the page to update the app.");
    this.name = "NewerDataError";
  }
}

/** Deleting the account's copy needs the server, and it couldn't be reached. Nothing was deleted. */
export class OfflineError extends Error {
  constructor() {
    super("You need to be online to delete your data. Nothing was deleted.");
    this.name = "OfflineError";
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
 * A usable Occasion id or Earn Date edit key: each becomes a field name in the
 * account document, where Firestore reserves names like `__name__`, and a
 * plain object must never be handed `__proto__`.
 */
const isEntryKey = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 200 && !/^__.*__$/.test(v);

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
    if (!isRecord(o) || !isEntryKey(o.id) || seen.has(o.id)) continue;
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
    const name = typeof o.name === "string" ? o.name : "";
    // Approval is stored only when there is some, so older saves keep their shape (US-23).
    const approvedDays = Array.isArray(o.approvedDays)
      ? [...new Set(o.approvedDays)]
          .filter((d): d is IsoDate => isSupportedDate(d) && d >= start && d <= end)
          .sort()
      : [];
    occasions.push({
      id: o.id,
      name,
      start,
      end,
      dayTypes,
      ...(o.approved === true && { approved: true }),
      ...(approvedDays.length > 0 && { approvedDays }),
    });
  }
  return occasions;
}

function earnDateEditsFrom(value: unknown): EarnDateEdits {
  if (!isRecord(value)) return {};
  const edits: EarnDateEdits = {};
  for (const [key, date] of Object.entries(value)) if (isEntryKey(key) && isSupportedDate(date)) edits[key] = date;
  return edits;
}

/**
 * AppData with Occasions keyed by id, so each setting, Occasion and Earn Date
 * edit is one entry that can change on its own: the unit both stores save
 * edits in (ADR 0003).
 */
export interface KeyedAppData {
  settings: Settings;
  occasions: Record<string, Occasion>;
  earnDateEdits: EarnDateEdits;
}

export const SECTIONS = ["settings", "occasions", "earnDateEdits"] as const;

/** One setting, Occasion or Earn Date edit an edit changed. No `value` means it was removed. */
export interface DataChange {
  section: (typeof SECTIONS)[number];
  key: string;
  value?: unknown;
}

export function keyedAppData(data: AppData): KeyedAppData {
  return {
    settings: data.settings,
    occasions: Object.fromEntries(data.occasions.map((o) => [o.id, o])),
    earnDateEdits: data.earnDateEdits,
  };
}

/** Reads a version 2 `data` map back into AppData, checked like any other save. */
export function fromKeyedAppData(data: unknown): AppData {
  const raw = isRecord(data) ? data : {};
  const occasions = isRecord(raw.occasions)
    ? Object.entries(raw.occasions).map(([id, o]) => (isRecord(o) ? { ...o, id } : o))
    : [];
  return withDefaults({ ...raw, occasions } as Partial<AppData>);
}

/** What an edit changed, entry by entry: the only parts a save needs to write. */
export function changesBetween(before: AppData, after: AppData): DataChange[] {
  const was = keyedAppData(before);
  const now = keyedAppData(after);
  const changes: DataChange[] = [];
  for (const section of SECTIONS) {
    const a = was[section] as Record<string, unknown>;
    const b = now[section] as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!Object.hasOwn(b, key)) changes.push({ section, key });
      else if (!Object.hasOwn(a, key) || stableJson(a[key]) !== stableJson(b[key])) {
        changes.push({ section, key, value: b[key] });
      }
    }
  }
  return changes;
}

/** `data` with each change applied on top, leaving every other entry as it is. */
export function applyChanges(data: AppData, changes: DataChange[]): AppData {
  const keyed = structuredClone(keyedAppData(data));
  for (const { section, key, value } of changes) {
    const entries = keyed[section] as Record<string, unknown>;
    if (value === undefined) delete entries[key];
    else entries[key] = structuredClone(value);
  }
  return fromKeyedAppData(keyed);
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
  return stableJson(keyedAppData(data));
}

/** JSON with object keys sorted, so equal values compare equal whatever their key order. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
