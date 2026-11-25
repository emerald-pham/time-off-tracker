import { addDays, addMonthsClamped, isoDate, maxDate, yearOf } from "./dates";
import type { IsoDate, ScheduleEntry, Settings } from "./types";

/** Hours that count toward one year's Vacation (Art. 21 §1). */
const YEARLY_HOURS_LIMIT = 1800;

export interface AccrualTier {
  weeks: 1 | 2 | 3 | 4;
  /** Hours worked per Vacation day. */
  step: number;
  daysPerYear: number;
  /** Vacation Cap: 2 x the tier's yearly hours (Art. 21 §5). */
  capHours: number;
}

const TIERS: Record<AccrualTier["weeks"], AccrualTier> = {
  1: { weeks: 1, step: 360, daysPerYear: 5, capHours: 80 },
  2: { weeks: 2, step: 180, daysPerYear: 10, capHours: 160 },
  3: { weeks: 3, step: 120, daysPerYear: 15, capHours: 240 },
  4: { weeks: 4, step: 90, daysPerYear: 20, capHours: 320 },
};

/** Accrual Tier for calendar year `year` (Art. 21 §4). */
export function accrualTier(hire: IsoDate, year: number): AccrualTier {
  const h = yearOf(hire);
  if (year >= h + 17) return TIERS[4];
  if (year >= h + 5) return TIERS[3];
  if (year >= h + 2) return TIERS[2];
  return TIERS[1];
}

/**
 * The Vacation and Floating Holiday schedule from the hire year through
 * `throughYear`, in key order. Empty until a hire date is set.
 */
export function projectSchedule(settings: Settings, throughYear: number): ScheduleEntry[] {
  const hire = settings.hireDate;
  if (!hire) return [];
  const entries: ScheduleEntry[] = [];
  for (let year = yearOf(hire); year <= throughYear; year++) {
    entries.push(...vacationSchedule(hire, settings.weeklyHours, year));
    entries.push(...floatingHolidaySchedule(hire, year));
  }
  return entries;
}

/**
 * Floating Holidays for `year` (Art. 20 §3). Keys use the posting slot:
 * Mar 1 = 1, Jun 1 = 2, Sep 1 = 3, so they stay stable if the hire date moves.
 * Each expires Dec 31 of its year.
 */
function floatingHolidaySchedule(hire: IsoDate, year: number): ScheduleEntry[] {
  const jan1 = isoDate(year, 1, 1);
  const fullYear = addMonthsClamped(hire, 12) <= jan1;
  const postings = fullYear
    ? [jan1, jan1, jan1]
    : [isoDate(year, 3, 1), isoDate(year, 6, 1), isoDate(year, 9, 1)];
  const entries: ScheduleEntry[] = [];
  postings.forEach((earnDate, i) => {
    if (earnDate < hire) return;
    entries.push({
      key: `fh:${year}:${i + 1}`,
      benefitType: "floatingHoliday",
      scheduleYear: year,
      earnDate,
    });
  });
  return entries;
}

function vacationSchedule(hire: IsoDate, weeklyHours: number, year: number): ScheduleEntry[] {
  if (!(weeklyHours > 0)) return [];
  const hireYear = year === yearOf(hire);
  const start = hireYear ? hire : isoDate(year, 1, 1);
  const unlock = addMonthsClamped(hire, 9);
  const { step } = accrualTier(hire, year);
  const entries: ScheduleEntry[] = [];
  for (let k = 1; k * step <= YEARLY_HOURS_LIMIT; k++) {
    const raw = addDays(start, Math.floor((k * step * 7) / weeklyHours));
    if (yearOf(raw) !== year) break;
    entries.push({
      key: hireYear ? `vacation:hire:${k}` : `vacation:${year}:${k}`,
      benefitType: "vacation",
      scheduleYear: year,
      earnDate: hireYear ? maxDate(raw, unlock) : raw,
    });
  }
  return entries;
}
