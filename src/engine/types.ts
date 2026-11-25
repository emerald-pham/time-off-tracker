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
  /**
   * SAP Balance as-of date. Null only before setup: the app stamps it when
   * the hire date is entered and never clears it. If it's still null, the
   * engine uses today.
   */
  sapAsOf: IsoDate | null;
  /** Full-year history mode: rebuild the current year from the hire date. Off by default. */
  fullYearHistory: boolean;
}

/** An Occasion as stored. */
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

/** Earn Date edits by schedule key. */
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
  /**
   * The date the hours are credited: the raw schedule date. It decides
   * whether the entry is already in the SAP Balance (walk-back and Payday
   * split). An Earn Date edit moves it too.
   */
  creditedDate: IsoDate;
  /**
   * The date the Benefit Day becomes usable: the credited date, but never
   * before the eligibility date for Vacation. Shown on the Ledger and used by
   * Burning.
   */
  earnDate: IsoDate;
  /** Moved to the person's Earn Date edit. */
  edited?: boolean;
}

/** Where a Ledger row came from. */
export type RowOrigin =
  /** Picked by the SAP walk-back. */
  | "starting"
  /** Walk-back ran out of schedule entries; dated at hire (Vacation) or Jan 1 (Floating Holiday). */
  | "extra"
  /** Full-year history mode: this year's schedule entry, already in SAP by the as-of date. */
  | "history"
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
  /** Approximate: Earn Date assigned by walking back, or beyond what the schedule explains. Shown with "*". */
  approximate: boolean;
  /**
   * Estimated: the Earn Date is later than today, so the day isn't earned
   * yet. False means Earned. Shown in italics.
   */
  notYetEarned: boolean;
  /** The Occasion that Burns this row; null when free. Set by Burning (ticket 02). */
  burnedBy: BurnedBy | null;
  /** Ticket 02. */
  lostToCap: boolean;
  /** Ticket 02. */
  expired: boolean;
  /** Current-year Floating Holiday that's still free: "expires Dec 31". */
  expiresWarning: boolean;
  /** The user changed the Earn Date: shown with a dot. */
  edited: boolean;
  /**
   * In SAP by the as-of date, but SAP shows it used and no listed Day Off
   * explains it. Burns nothing. Set in full-year history mode, and on an
   * edited row moved among the days SAP already shows used.
   */
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
  /**
   * Full-year history mode: rows marked Used (not listed) because SAP shows
   * days used that no listed Day Off explains, so the UI can tell the user.
   */
  usedNotListed: BenefitCounts;
}

export type SeasonName = "Winter" | "Spring" | "Summer" | "Autumn";

/** The part of the year an Occasion starts in, labelled with the year of its first month. */
export interface Season {
  name: SeasonName;
  year: number;
}

/** One Day Off of an Occasion, with its Day Type resolved (stored or default). */
export interface DayOffView {
  date: IsoDate;
  dayType: DayType;
  /** Its Payroll Week's paycheck has come out: history, Burns nothing. */
  deducted: boolean;
  /** Key of the Ledger row this Day Off Burns, if any. */
  burns: ScheduleKey | null;
  /** A paid Day Off that found no eligible Benefit Day (counts toward Short). */
  unmet: boolean;
}

export interface OccasionView {
  id: string;
  name: string;
  start: IsoDate;
  end: IsoDate;
  /** One per date from start to end. */
  days: DayOffView[];
  /** Floating Holiday and Vacation Days Off. */
  ptoDays: number;
  unpaid: number;
  /** Paid Days Off left unmet: "short by N". */
  short: number;
  season: Season;
  /** Every Day Off is Deducted: the Occasion is greyed as a whole. */
  deducted: boolean;
}

/** One Occasion's side of a Clash. */
export interface ClashEntry {
  occasionId: string;
  occasionName: string;
  dayType: BenefitType;
}

/** A date two or more Occasions mark as Vacation or Floating Holiday. */
export interface Clash {
  date: IsoDate;
  entries: ClashEntry[];
}

export interface ViewModel {
  ledger: LedgerView;
  /** Sorted by start date. */
  occasions: OccasionView[];
  /** Clashes among the given Occasions, by date. */
  clashes: Clash[];
  /** False until a hire date is entered; the UI opens on Settings. */
  configured: boolean;
}
