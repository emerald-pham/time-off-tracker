import { LAST_SUPPORTED_YEAR, isSupportedDate, isoDate, yearOf } from "./dates";
import { burn } from "./burning";
import { findClashes, occasionViews } from "./occasions";
import { paidBy } from "./payday";
import { eligibilityDate, projectSchedule } from "./schedule";
import type {
  BenefitCounts,
  BenefitType,
  EarnDateEdits,
  EngineInput,
  FreeOutlook,
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
 * What the app counts from an SAP balance: whole 8-hour Benefit Days. The
 * hours left over (less than a day) are ignored everywhere in the engine and
 * only reported for Settings to explain. Worked in hundredths of an hour so
 * 37.6 h is 4 days + 5.6 h, not 5.600000000000001.
 */
export function sapBalanceDays(hours: number): { days: number; leftoverHours: number } {
  const hundredths = Math.round(hours * 100);
  const perDay = HOURS_PER_DAY * 100;
  return { days: Math.floor(hundredths / perDay), leftoverHours: (hundredths % perDay) / 100 };
}

/**
 * The engine's single entry point: recalculates the whole view model from
 * scratch on every change.
 *
 * Pipeline:
 *   1. project the schedule through the last year shown, and move each
 *      edited entry to its Earn Date edit (by schedule key)
 *   2. turn it into Ledger rows, starting from the SAP Balance (ADR 0002),
 *      or, in full-year history mode, rebuilding the current year
 *   3. apply the edits of extra walk-back rows, which aren't schedule entries
 *   4. resolve each Occasion's Days Off, then Burn rows in one date-order pass
 *      (see burning.ts; Vacation Cap marks rows Lost to cap)
 *   5. rollover: earlier years' Vacation becomes Carryover, Floating Holidays expire
 *   6. mark rows Estimated (Earn Date after today) or Earned
 *   7. group by year and count free rows
 */
export function computeView(input: EngineInput): ViewModel {
  const { settings, today } = input;
  const edits = supportedEdits(input.earnDateEdits);
  const currentYear = yearOf(today);
  const asOf = settings.sapAsOf ?? today;
  const occasions = occasionViews(input.occasions, asOf);

  // Show the current year, next year and any later year an Occasion reaches.
  // An Earn Date edit can move a row later still: then show that year too
  // (projecting its schedule), so no row is left off the Ledger.
  let lastYear = Math.max(currentYear + 1, ...input.occasions.map((o) => yearOf(o.end)));
  let built = ledgerRows(settings, edits, asOf, currentYear, lastYear, occasions);
  for (
    let furthest = latestYear(built.rows);
    furthest > lastYear && furthest <= LAST_SUPPORTED_YEAR;
    furthest = latestYear(built.rows)
  ) {
    lastYear = furthest;
    built = ledgerRows(settings, edits, asOf, currentYear, lastYear, occasions);
  }

  const burned = applyEarnDateEdits(built.rows, edits);
  burn(burned, occasions, {
    hireDate: settings.hireDate,
    history: built.usedNotListed && { year: currentYear, usedNotListed: built.usedNotListed },
  });
  const earned = rollover(burned, currentYear).map((r) => ({ ...r, notYetEarned: r.earnDate > today }));
  const rowGroups = groupByYear(earned, currentYear, lastYear);
  const shown = rowGroups.flatMap((g) => g.rows);
  const groups = rowGroups.map((g) => ({ ...g, freeByEnd: freeUsableOn(shown, isoDate(g.year, 12, 31)) }));

  return {
    configured: settings.hireDate !== null,
    occasions: suggestFloatingHolidays(occasions, earned),
    clashes: findClashes(occasions),
    ledger: {
      groups,
      free: countFree(shown),
      freeBy: freeOutlook(shown, today, currentYear),
      usedNotListed: countUsedNotListed(shown),
    },
  };
}

/**
 * US-26: for each Occasion, the Vacation Days Off (not Deducted) that free
 * Floating Holidays could cover instead. A free one covers a day in its own
 * calendar year that it is earned by. Days are taken earliest first, each
 * using any Floating Holiday still unmatched: one earned by an earlier day is
 * earned by every later one too, so this covers as many days as possible.
 */
function suggestFloatingHolidays(occasions: OccasionView[], rows: LedgerRow[]): OccasionView[] {
  const free = rows.filter((r) => r.benefitType === "floatingHoliday" && isFree(r));
  return occasions.map((o) => {
    const unmatched = [...free];
    const covered: IsoDate[] = [];
    for (const day of o.days) {
      if (day.dayType !== "vacation" || day.deducted) continue;
      const i = unmatched.findIndex((r) => r.earnDate <= day.date && yearOf(r.earnDate) === yearOf(day.date));
      if (i < 0) continue;
      unmatched.splice(i, 1);
      covered.push(day.date);
    }
    return { ...o, floatingHolidaysCouldCover: covered };
  });
}

/**
 * Free rows usable now, on Dec 31 of this year and on Dec 31 of next year.
 * A Floating Holiday is only usable in its own year, so by the end of next
 * year only next year's count.
 */
function freeOutlook(rows: LedgerRow[], today: IsoDate, thisYear: number): FreeOutlook {
  const count = (usableOn: IsoDate) => freeUsableOn(rows, usableOn);
  return {
    thisYear,
    earnedNow: count(today),
    endOfThisYear: count(isoDate(thisYear, 12, 31)),
    endOfNextYear: count(isoDate(thisYear + 1, 12, 31)),
  };
}

/** Free rows earned by `usableOn` and still usable that day: a Floating Holiday only in its own year. */
function freeUsableOn(rows: LedgerRow[], usableOn: IsoDate): BenefitCounts {
  return countFree(
    rows.filter(
      (r) =>
        isFree(r) &&
        r.earnDate <= usableOn &&
        (r.benefitType === "vacation" || yearOf(r.earnDate) === yearOf(usableOn)),
    ),
  );
}

/**
 * Ledger rows before Burning, for the schedule projected through `lastYear`
 * with Earn Date edits applied. In full-year history mode, also how many rows
 * of each type Burning should mark Used (not listed).
 */
function ledgerRows(
  settings: Settings,
  edits: EarnDateEdits,
  asOf: IsoDate,
  currentYear: number,
  lastYear: number,
  occasions: OccasionView[],
): { rows: LedgerRow[]; usedNotListed: BenefitCounts | null } {
  // Edits come first, so the walk-back and the in-SAP split see the edited Earn Dates.
  const schedule = withEarnDateEdits(projectSchedule(settings, lastYear), edits);
  const { rows, usedNotListed } = settings.fullYearHistory
    ? fullYearRows(schedule, settings, asOf, currentYear, occasions)
    : { rows: startingRows(schedule, settings, asOf), usedNotListed: null };
  // An edited entry that SAP already shows used (left out by the walk-back, or
  // a Floating Holiday moved into an earlier year) stays listed, so its edit
  // can be reset.
  const listed = new Set(rows.map((r) => r.key));
  const leftOut = schedule
    .filter((e) => e.edited && !listed.has(e.key))
    .map((e) => ({ ...row(e.key, e.benefitType, e.earnDate, "starting"), usedNotListed: true }));
  return { rows: [...rows, ...leftOut], usedNotListed };
}

function latestYear(rows: LedgerRow[]): number {
  return Math.max(-Infinity, ...rows.map((r) => yearOf(r.earnDate)));
}

/**
 * Starting from the SAP Balance: walk the schedule back from the as-of date,
 * newest credited first, picking one entry per whole SAP day. Entries not yet
 * in SAP are projected. In-SAP entries that weren't picked were used before
 * tracking began and don't appear.
 *
 * Whether an entry is in SAP goes by the date its hours were credited, not
 * its Earn Date: SAP holds a new hire's Vacation from the payday after it's
 * credited, though it can't be used before the eligibility date.
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
      days: sapBalanceDays(settings.sapVacationHours).days,
      // A projected Vacation day is in SAP once the Payday after it's credited is on or before as-of.
      candidates: vacation.filter((e) => paidBy(e.creditedDate, asOf)),
      projected: vacation.filter((e) => !paidBy(e.creditedDate, asOf)),
      extraDate: eligibilityDate(hire),
      extraKeyPrefix: "vacation:extra",
    }),
    ...walkBack({
      benefitType: "floatingHoliday",
      days: sapBalanceDays(settings.sapFloatingHolidayHours).days,
      // A Floating Holiday is in SAP from its posting date.
      candidates: fh.filter((e) => yearOf(e.creditedDate) === asOfYear && e.creditedDate <= asOf),
      projected: fh.filter((e) => e.creditedDate > asOf),
      extraDate: isoDate(asOfYear, 1, 1),
      extraKeyPrefix: `fh:${asOfYear}:extra`,
    }),
  ];
}

/** Earn Date edits whose date the app could have saved; anything else is ignored. */
function supportedEdits(edits: EarnDateEdits): EarnDateEdits {
  return Object.fromEntries(Object.entries(edits).filter(([, date]) => isSupportedDate(date)));
}

/**
 * Earn Date edits are stored by schedule key, so they survive any
 * regeneration (hire date, weekly hours). An edit whose key no longer exists
 * is ignored. Edited entries move before the walk-back, so an entry moved
 * before the as-of date counts as one of SAP's days, and one moved past it is
 * projected. An edit is a manual override: it sets the credited date too, and
 * isn't held back to the eligibility date.
 */
function withEarnDateEdits(schedule: ScheduleEntry[], edits: EarnDateEdits): ScheduleEntry[] {
  return schedule.map((e) =>
    Object.hasOwn(edits, e.key)
      ? { ...e, creditedDate: edits[e.key], earnDate: edits[e.key], edited: true }
      : e,
  );
}

/**
 * Marks edited rows, and moves extra walk-back rows (which aren't schedule
 * entries) to their edits. The edited date is the user's, so the row is no
 * longer Approximate.
 */
function applyEarnDateEdits(rows: LedgerRow[], edits: EarnDateEdits): LedgerRow[] {
  return rows.map((r) =>
    Object.hasOwn(edits, r.key) ? { ...r, earnDate: edits[r.key], edited: true, approximate: false } : r,
  );
}

/**
 * Full-year history mode: the current year's Benefit Days are rebuilt in full
 * from the schedule, and the SAP Balance sets Carryover. For each Benefit Type,
 *   c = SAP days + this year's Deducted Days Off − this year's entries in SAP.
 * If c > 0, c Carryover rows are found by walking back earlier years' entries
 * (Vacation) or dated Jan 1 (Floating Holidays). If c < 0, SAP shows |c| days
 * used that no Day Off explains: once this year's Deducted Days Off have
 * Burned, Burning marks the |c| oldest rows in SAP still free Used (not listed).
 */
function fullYearRows(
  schedule: ScheduleEntry[],
  settings: Settings,
  asOf: IsoDate,
  year: number,
  occasions: OccasionView[],
): { rows: LedgerRow[]; usedNotListed: BenefitCounts } {
  const hire = settings.hireDate;
  if (!hire) return { rows: [], usedNotListed: { vacation: 0, floatingHoliday: 0 } };
  const deductedDaysOff = (t: BenefitType) =>
    occasions
      .flatMap((o) => o.days)
      .filter((d) => d.dayType === t && d.deducted && yearOf(d.date) === year).length;
  const vacation = schedule.filter((e) => e.benefitType === "vacation");
  const fh = schedule.filter((e) => e.benefitType === "floatingHoliday");
  const vacationInSap = (e: ScheduleEntry) => paidBy(e.creditedDate, asOf);
  const fhInSap = (e: ScheduleEntry) => e.creditedDate <= asOf;

  const vacationYear = rebuildYear({
    benefitType: "vacation",
    year,
    entries: vacation,
    inSap: vacationInSap,
    sapDays: sapBalanceDays(settings.sapVacationHours).days,
    deductedDaysOff: deductedDaysOff("vacation"),
    carryoverCandidates: vacation.filter((e) => yearOf(e.earnDate) < year && vacationInSap(e)),
    extraDate: eligibilityDate(hire),
    extraKeyPrefix: "vacation:extra",
  });
  const fhYear = rebuildYear({
    benefitType: "floatingHoliday",
    year,
    entries: fh,
    inSap: fhInSap,
    // A balance read in an earlier year is that year's Floating Holidays, which have expired.
    sapDays: yearOf(asOf) < year ? 0 : sapBalanceDays(settings.sapFloatingHolidayHours).days,
    deductedDaysOff: deductedDaysOff("floatingHoliday"),
    // Floating Holidays don't carry over: extra rows are dated Jan 1.
    carryoverCandidates: [],
    extraDate: isoDate(year, 1, 1),
    extraKeyPrefix: `fh:${year}:extra`,
  });
  return {
    rows: [...vacationYear.rows, ...fhYear.rows],
    usedNotListed: { vacation: vacationYear.usedNotListed, floatingHoliday: fhYear.usedNotListed },
  };
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
}): { rows: LedgerRow[]; usedNotListed: number } {
  const history = args.entries
    .filter((e) => yearOf(e.earnDate) === args.year && args.inSap(e))
    .sort(compareEntries);
  const c = args.sapDays + args.deductedDaysOff - history.length;
  return {
    rows: [
      ...history.map((e) => row(e.key, args.benefitType, e.earnDate, "history")),
      ...walkBack({
        benefitType: args.benefitType,
        days: Math.max(0, c),
        candidates: args.carryoverCandidates,
        projected: args.entries.filter((e) => !args.inSap(e)),
        extraDate: args.extraDate,
        extraKeyPrefix: args.extraKeyPrefix,
      }),
    ],
    usedNotListed: Math.max(0, -c),
  };
}

function walkBack(args: {
  benefitType: BenefitType;
  days: number;
  candidates: ScheduleEntry[];
  projected: ScheduleEntry[];
  extraDate: IsoDate;
  extraKeyPrefix: string;
}): LedgerRow[] {
  // Newest credited first, except that days the person dated themselves come
  // before approximate ones: moving a day in SAP to an older date keeps it in SAP.
  const newestFirst = [...args.candidates].sort(
    (a, b) =>
      Number(Boolean(b.edited)) - Number(Boolean(a.edited)) ||
      b.creditedDate.localeCompare(a.creditedDate) ||
      compareEntries(b, a),
  );
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
    approximate: origin === "starting" || origin === "extra",
    notYetEarned: false,
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
 * Groups rows by calendar year from the current year to the last year shown;
 * earlier rows sit in the current year, with Carryover at the top. Expired
 * Floating Holidays from years that have ended are hidden, unless edited, so
 * the edit can be reset.
 */
function groupByYear(rows: LedgerRow[], currentYear: number, lastYear: number): Omit<LedgerGroup, "freeByEnd">[] {
  const groups: Omit<LedgerGroup, "freeByEnd">[] = [];
  for (let year = currentYear; year <= lastYear; year++) groups.push({ year, rows: [] });
  for (const r of rows) {
    if (r.expired && !r.edited) continue;
    const year = Math.max(yearOf(r.earnDate), currentYear);
    // Only a date outside the supported years can fall past the last group.
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

/** Rows full-year history marked Used (not listed); edited rows SAP shows used are the person's own doing. */
function countUsedNotListed(rows: LedgerRow[]): BenefitCounts {
  const used = { vacation: 0, floatingHoliday: 0 };
  for (const r of rows) if (r.usedNotListed && r.origin === "history") used[r.benefitType]++;
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
