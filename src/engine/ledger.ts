import { isoDate, yearOf } from "./dates";
import { burn } from "./burning";
import { occasionViews } from "./occasions";
import { paidBy } from "./payday";
import { projectSchedule } from "./schedule";
import type {
  BenefitCounts,
  BenefitType,
  EngineInput,
  IsoDate,
  LedgerGroup,
  LedgerRow,
  RowOrigin,
  ScheduleEntry,
  Settings,
  ViewModel,
} from "./types";

const HOURS_PER_DAY = 8;

/**
 * The engine's single entry point: recalculates the whole view model from
 * scratch on every change.
 *
 * Pipeline (later tickets slot in as marked):
 *   1. project the schedule through the last year shown
 *   2. turn it into Ledger rows, starting from the SAP Balance (ADR 0002)
 *      [ticket 03: apply Earn Date edits; full-year history mode]
 *   3. resolve each Occasion's Days Off, then Burn rows in one date-order pass
 *      (see burning.ts; Vacation Cap marks rows Lost to cap)
 *   4. rollover: earlier years' Vacation becomes Carryover, Floating Holidays expire
 *   5. group by year and count free rows
 */
export function computeView(input: EngineInput): ViewModel {
  const { settings, today } = input;
  const currentYear = yearOf(today);
  const lastYear = Math.max(currentYear + 1, ...input.occasions.map((o) => yearOf(o.end)));
  const asOf = settings.sapAsOf ?? today;

  const schedule = projectSchedule(settings, lastYear);
  const occasions = occasionViews(input.occasions, settings);
  const burned = startingRows(schedule, settings, asOf);
  burn(burned, occasions);
  const rows = rollover(burned, currentYear);

  return {
    configured: settings.hireDate !== null,
    occasions,
    clashes: [],
    ledger: {
      groups: groupByYear(rows, currentYear, lastYear),
      free: countFree(rows),
      leftoverHours: {
        vacation: settings.sapVacationHours % HOURS_PER_DAY,
        floatingHoliday: settings.sapFloatingHolidayHours % HOURS_PER_DAY,
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
      days: Math.floor(settings.sapVacationHours / HOURS_PER_DAY),
      // A projected Vacation day is in SAP once its Payday is on or before as-of.
      candidates: vacation.filter((e) => paidBy(e.earnDate, asOf)),
      projected: vacation.filter((e) => !paidBy(e.earnDate, asOf)),
      extraDate: hire,
      extraKeyPrefix: "vacation:extra",
    }),
    ...walkBack({
      benefitType: "floatingHoliday",
      days: Math.floor(settings.sapFloatingHolidayHours / HOURS_PER_DAY),
      // A Floating Holiday is in SAP from its posting date.
      candidates: fh.filter((e) => yearOf(e.earnDate) === asOfYear && e.earnDate <= asOf),
      projected: fh.filter((e) => e.earnDate > asOf),
      extraDate: isoDate(asOfYear, 1, 1),
      extraKeyPrefix: `fh:${asOfYear}:extra`,
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
    estimated: origin !== "projected",
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
 */
function rollover(rows: LedgerRow[], currentYear: number): LedgerRow[] {
  return rows.map((r) => {
    const year = yearOf(r.earnDate);
    if (!isFree(r)) return r;
    if (r.benefitType === "vacation") return { ...r, carryover: year < currentYear };
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
