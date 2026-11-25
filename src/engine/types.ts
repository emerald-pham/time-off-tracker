/**
 * Engine types. The engine is pure: settings, Occasions, Earn Date edits and
 * today go in, a view model comes out. See spec "Engine shape".
 *
 * Dates are plain calendar dates as ISO strings ("2026-11-24"), never Date
 * objects, so they serialize cleanly and carry no time zone.
 */

export type IsoDate = string;

/** 0 = Sunday ... 6 = Saturday, as in Date.getUTCDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type BenefitType = "vacation" | "floatingHoliday";

export type DayType = "rdo" | "floatingHoliday" | "vacation" | "unpaid";

export interface Settings {
  /** Null until the person enters it; the UI opens on Settings while null. */
  hireDate: IsoDate | null;
  weeklyHours: number;
  regularDaysOff: Weekday[];
  sapVacationHours: number;
  sapFloatingHolidayHours: number;
  /** SAP Balance as-of date. Null means "today". */
  sapAsOf: IsoDate | null;
  /** Full-year history mode (ticket 03). Off by default. */
  fullYearHistory: boolean;
}

/** An Occasion as stored. Burning arrives in ticket 02. */
export interface Occasion {
  id: string;
  name: string;
  start: IsoDate;
  end: IsoDate;
  /** Day Type per Day Off. Dates in the range that are missing get defaults. */
  dayTypes: Record<IsoDate, DayType>;
}

/**
 * Schedule keys, e.g. "vacation:2026:3", "vacation:hire:1", "fh:2027:2".
 * Extra walk-back rows get "vacation:extra:N" and "fh:<year>:extra:N".
 */
export type ScheduleKey = string;

/** Earn Date edits by schedule key (ticket 03). */
export type EarnDateEdits = Record<ScheduleKey, IsoDate>;

export interface EngineInput {
  settings: Settings;
  occasions: Occasion[];
  earnDateEdits: EarnDateEdits;
  today: IsoDate;
}

/** One projected entry from the Vacation or Floating Holiday schedule. */
export interface ScheduleEntry {
  key: ScheduleKey;
  benefitType: BenefitType;
  /** Calendar year whose schedule produced it (the hire year for "vacation:hire:k"). */
  scheduleYear: number;
  earnDate: IsoDate;
}

/** Where a Ledger row came from. */
export type RowOrigin =
  /** Picked by the SAP walk-back. */
  | "starting"
  /** Walk-back ran out of schedule entries; dated at hire (Vacation) or Jan 1 (Floating Holiday). */
  | "extra"
  /** Not yet in SAP by the as-of date. */
  | "projected";

export interface BurnedBy {
  occasionId: string;
  occasionName: string;
  date: IsoDate;
}

/** One Benefit Day on the Ledger. */
export interface LedgerRow {
  /** Stable row id; equals the schedule key. */
  key: ScheduleKey;
  benefitType: BenefitType;
  earnDate: IsoDate;
  origin: RowOrigin;
  /** Vacation earned in an earlier calendar year: "Vacation (Previous Year)". */
  carryover: boolean;
  /** Earn Date assigned by walking back, or beyond what the schedule explains. */
  estimated: boolean;
  /** The Occasion that Burns this row; null when free. Set by Burning (ticket 02). */
  burnedBy: BurnedBy | null;
  /** Ticket 02. */
  lostToCap: boolean;
  /** Ticket 02. */
  expired: boolean;
  /** Current-year Floating Holiday that's still free: "expires Dec 31". */
  expiresWarning: boolean;
  /** The user changed the Earn Date (ticket 03). */
  edited: boolean;
  /** Full-year history mode only (ticket 03). */
  usedNotListed: boolean;
}

export interface LedgerGroup {
  year: number;
  rows: LedgerRow[];
}

export interface BenefitCounts {
  vacation: number;
  floatingHoliday: number;
}

export interface LedgerView {
  groups: LedgerGroup[];
  /** Free Benefit Days by type, for "Free: 6 Vacation, 2 Floating Holidays". */
  free: BenefitCounts;
  /** SAP hours that don't make a whole Benefit Day, for the "+4 hrs" note. */
  leftoverHours: BenefitCounts;
}

export interface ViewModel {
  ledger: LedgerView;
  /** False until a hire date is entered; the UI opens on Settings. */
  configured: boolean;
}
