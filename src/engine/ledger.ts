import { isoDate, yearOf } from "./dates";
import { burn } from "./burning";
import { findClashes, occasionViews } from "./occasions";
import { paidBy } from "./payday";
import { projectSchedule } from "./schedule";
import type {
  BenefitCounts,
  BenefitType,
  EarnDateEdits,
  EngineInput,
  IsoDate,
  LedgerGroup,
  LedgerRow,
  OccasionView,
  RowOrigin,
  ScheduleEntry,
  Settings,
  ViewModel,
} from "./types";

const HOURS_PER_DAY = 8;

/**
 * A balance in hours as whole Benefit Days plus the hours left over, worked
 * in hundredths of an hour so 37.6 h is 4 days + 5.6 h, not 5.600000000000001.
 */
function splitHours(hours: number): { days: number; leftover: number } {
  const hundredths = Math.round(hours * 100);
  const perDay = HOURS_PER_DAY * 100;
  return { days: Math.floor(hundredths / perDay), leftover: (hundredths % perDay) / 100 };
}

/**
 * The engine's single entry point: recalculates the whole view model from
 * scratch on every change.
 *
 * Pipeline (later tickets slot in as marked):
 *   1. project the schedule through the last year shown
 *   2. turn it into Ledger rows, starting from the SAP Balance (ADR 0002),
 *      or, in full-year history mode, rebuilding the current year
 *   3. apply Earn Date edits by schedule key
 *   4. resolve each Occasion's Days Off, then Burn rows in one date-order pass
 *      (see burning.ts; Vacation Cap marks rows Lost to cap)
 *   5. rollover: earlier years' Vacation becomes Carryover, Floating Holidays expire
 *   6. group by year and count free rows
 */
export function computeView(input: EngineInput): ViewModel {
  const { settings, today } = input;
  const currentYear = yearOf(today);
  const lastYear = Math.max(currentYear + 1, ...input.occasions.map((o) => yearOf(o.end)));
  const asOf = settings.sapAsOf ?? today;

  const schedule = projectSchedule(settings, lastYear);
  const occasions = occasionViews(input.occasions, settings, asOf);
  const ledgerRows = settings.fullYearHistory
    ? fullYearRows(schedule, settings, asOf, currentYear, occasions)
    : startingRows(schedule, settings, asOf);
  const burned = applyEarnDateEdits(ledgerRows, input.earnDateEdits);
  burn(burned, occasions, {
    hireDate: settings.hireDate,
    leftoverVacationHours: splitHours(settings.sapVacationHours).leftover,
    historyYear: settings.fullYearHistory ? currentYear : null,
  });
  const rows = rollover(burned, currentYear);

  return {
    configured: settings.hireDate !== null,
    occasions,
    clashes: findClashes(occasions),
    ledger: {
      groups: groupByYear(rows, currentYear, lastYear),
      free: countFree(rows),
      usedNotListed: countUsedNotListed(rows),
      leftoverHours: {
        vacation: splitHours(settings.sapVacationHours).leftover,
        floatingHoliday: splitHours(settings.sapFloatingHolidayHours).leftover,
      },
    },
  };
}

/**
 * Starting from the SAP Balance: walk the schedule back from the as-of date,
 * newest first, picking one entry per whole SAP day. Entries not yet in SAP
 * are projected. In-SAP entries that weren't picked were used before
 * tracking began and don't appear.
 */
function startingRows(schedule: ScheduleEntry[], settings: Settings, asOf: IsoDate): LedgerRow[] {
  const hire = settings.hireDate;
  if (!hire) return [];
  const asOfYear = yearOf(asOf);
  const vacation = schedule.filter((e) => e.benefitType === "vacation");
  const fh = schedule.filter((e) => e.benefitType === "floatingHoliday");

  return [
    ...walkBack({
      benefitType: "vacation",
      days: splitHours(settings.sapVacationHours).days,
      // A projected Vacation day is in SAP once its Payday is on or before as-of.
      candidates: vacation.filter((e) => paidBy(e.earnDate, asOf)),
      projected: vacation.filter((e) => !paidBy(e.earnDate, asOf)),
      extraDate: hire,
      extraKeyPrefix: "vacation:extra",
    }),
    ...walkBack({
      benefitType: "floatingHoliday",
      days: splitHours(settings.sapFloatingHolidayHours).days,
      // A Floating Holiday is in SAP from its posting date.
      candidates: fh.filter((e) => yearOf(e.earnDate) === asOfYear && e.earnDate <= asOf),
      projected: fh.filter((e) => e.earnDate > asOf),
      extraDate: isoDate(asOfYear, 1, 1),
      extraKeyPrefix: `fh:${asOfYear}:extra`,
    }),
  ];
}

/**
 * Earn Date edits are stored by schedule key, so they survive any
 * regeneration (hire date, weekly hours). An edit whose key no longer exists
 * is ignored. The edited date is the user's, so the row is no longer Estimated.
 */
function applyEarnDateEdits(rows: LedgerRow[], edits: EarnDateEdits): LedgerRow[] {
  return rows.map((r) =>
    Object.hasOwn(edits, r.key) ? { ...r, earnDate: edits[r.key], edited: true, estimated: false } : r,
  );
}

/**
 * Full-year history mode: the current year's Benefit Days are rebuilt in full
 * from the schedule, and the SAP Balance sets Carryover. For each Benefit Type,
 *   c = SAP days + this year's Deducted Days Off − this year's entries in SAP.
 * If c > 0, c Carryover rows are found by walking back earlier years' entries
 * (Vacation) or dated Jan 1 (Floating Holidays). If c < 0, the |c| oldest rows
 * in SAP are Used (not listed): SAP shows days used that no Day Off explains.
 */
function fullYearRows(
  schedule: ScheduleEntry[],
  settings: Settings,
  asOf: IsoDate,
  year: number,
  occasions: OccasionView[],
): LedgerRow[] {
  const hire = settings.hireDate;
  if (!hire) return [];
  const deductedDaysOff = (t: BenefitType) =>
    occasions
      .flatMap((o) => o.days)
      .filter((d) => d.dayType === t && d.deducted && yearOf(d.date) === year).length;
  const vacation = schedule.filter((e) => e.benefitType === "vacation");
  const fh = schedule.filter((e) => e.benefitType === "floatingHoliday");
  const vacationInSap = (e: ScheduleEntry) => paidBy(e.earnDate, asOf);
  const fhInSap = (e: ScheduleEntry) => e.earnDate <= asOf;

  return [
    ...rebuildYear({
      benefitType: "vacation",
      year,
      entries: vacation,
      inSap: vacationInSap,
      sapDays: splitHours(settings.sapVacationHours).days,
      deductedDaysOff: deductedDaysOff("vacation"),
      carryoverCandidates: vacation.filter((e) => yearOf(e.earnDate) < year && vacationInSap(e)),
      extraDate: hire,
      extraKeyPrefix: "vacation:extra",
    }),
    ...rebuildYear({
      benefitType: "floatingHoliday",
      year,
      entries: fh,
      inSap: fhInSap,
      // A balance read in an earlier year is that year's Floating Holidays, which have expired.
      sapDays: yearOf(asOf) < year ? 0 : splitHours(settings.sapFloatingHolidayHours).days,
      deductedDaysOff: deductedDaysOff("floatingHoliday"),
      // Floating Holidays don't carry over: extra rows are dated Jan 1.
      carryoverCandidates: [],
      extraDate: isoDate(year, 1, 1),
      extraKeyPrefix: `fh:${year}:extra`,
    }),
  ];
}

function rebuildYear(args: {
  benefitType: BenefitType;
  year: number;
  entries: ScheduleEntry[];
  inSap: (e: ScheduleEntry) => boolean;
  sapDays: number;
  deductedDaysOff: number;
  carryoverCandidates: ScheduleEntry[];
  extraDate: IsoDate;
  extraKeyPrefix: string;
}): LedgerRow[] {
  const history = args.entries
    .filter((e) => yearOf(e.earnDate) === args.year && args.inSap(e))
    .sort(compareEntries);
  const c = args.sapDays + args.deductedDaysOff - history.length;
  const usedNotListed = Math.max(0, -c);
  return [
    ...history.map((e, i) => ({
      ...row(e.key, args.benefitType, e.earnDate, "history"),
      usedNotListed: i < usedNotListed,
    })),
    ...walkBack({
      benefitType: args.benefitType,
      days: Math.max(0, c),
      candidates: args.carryoverCandidates,
      projected: args.entries.filter((e) => !args.inSap(e)),
      extraDate: args.extraDate,
      extraKeyPrefix: args.extraKeyPrefix,
    }),
  ];
}

function walkBack(args: {
  benefitType: BenefitType;
  days: number;
  candidates: ScheduleEntry[];
  projected: ScheduleEntry[];
  extraDate: IsoDate;
  extraKeyPrefix: string;
}): LedgerRow[] {
  const newestFirst = [...args.candidates].sort((a, b) => compareEntries(b, a));
  const picked = newestFirst.slice(0, args.days);
  const extras = Math.max(0, args.days - picked.length);
  return [
    ...picked.map((e) => row(e.key, args.benefitType, e.earnDate, "starting")),
    ...Array.from({ length: extras }, (_, i) =>
      row(`${args.extraKeyPrefix}:${i + 1}`, args.benefitType, args.extraDate, "extra"),
    ),
    ...args.projected.map((e) => row(e.key, args.benefitType, e.earnDate, "projected")),
  ];
}

function row(key: string, benefitType: BenefitType, earnDate: IsoDate, origin: RowOrigin): LedgerRow {
  return {
    key,
    benefitType,
    earnDate,
    origin,
    carryover: false,
    estimated: origin === "starting" || origin === "extra",
    burnedBy: null,
    lostToCap: false,
    expired: false,
    expiresWarning: false,
    edited: false,
    usedNotListed: false,
  };
}

/**
 * On Jan 1, last year's free Vacation becomes Carryover and last year's free
 * Floating Holidays become Expired. A current-year Floating Holiday that's
 * still free shows "expires Dec 31".
 *
 * Runs after Burning, so "free on Jan 1" means not Lost to cap and not Burned
 * by a Day Off before this year. (A Floating Holiday only Burns within its
 * own year, so a Burned one never expires.)
 */
function rollover(rows: LedgerRow[], currentYear: number): LedgerRow[] {
  return rows.map((r) => {
    const year = yearOf(r.earnDate);
    if (r.benefitType === "vacation") {
      const freeOnJan1 =
        !r.lostToCap && !r.usedNotListed && (!r.burnedBy || yearOf(r.burnedBy.date) >= currentYear);
      return { ...r, carryover: year < currentYear && freeOnJan1 };
    }
    if (!isFree(r)) return r;
    return { ...r, expired: year < currentYear, expiresWarning: year === currentYear };
  });
}

function isFree(r: LedgerRow): boolean {
  return !r.burnedBy && !r.lostToCap && !r.expired && !r.usedNotListed;
}

/**
 * Groups rows by calendar year from the current year to the last year shown.
 * Carryover sits at the top of the current year. Expired Floating Holidays
 * from years that have ended are hidden.
 */
function groupByYear(rows: LedgerRow[], currentYear: number, lastYear: number): LedgerGroup[] {
  const groups: LedgerGroup[] = [];
  for (let year = currentYear; year <= lastYear; year++) groups.push({ year, rows: [] });
  for (const r of rows) {
    if (r.expired) continue;
    const year = Math.max(yearOf(r.earnDate), currentYear);
    groups[year - currentYear]?.rows.push(r);
  }
  for (const g of groups) g.rows.sort(compareRows);
  return groups;
}

function countFree(rows: LedgerRow[]): BenefitCounts {
  const free = { vacation: 0, floatingHoliday: 0 };
  for (const r of rows) if (isFree(r)) free[r.benefitType]++;
  return free;
}

function countUsedNotListed(rows: LedgerRow[]): BenefitCounts {
  const used = { vacation: 0, floatingHoliday: 0 };
  for (const r of rows) if (r.usedNotListed) used[r.benefitType]++;
  return used;
}

const byKey = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

function compareEntries(a: ScheduleEntry, b: ScheduleEntry): number {
  return a.earnDate.localeCompare(b.earnDate) || byKey(a.key, b.key);
}

/** Ledger order: Carryover first, then Earn Date; ties put starting rows first, then key. */
export function compareRows(a: LedgerRow, b: LedgerRow): number {
  return (
    Number(b.carryover) - Number(a.carryover) ||
    a.earnDate.localeCompare(b.earnDate) ||
    Number(a.origin === "projected") - Number(b.origin === "projected") ||
    byKey(a.key, b.key)
  );
}
