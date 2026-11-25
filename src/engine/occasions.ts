import { addDays, weekdayOf } from "./dates";
import { paidBy } from "./payday";
import type {
  Clash,
  ClashEntry,
  DayOffView,
  DayType,
  IsoDate,
  Occasion,
  OccasionView,
  Season,
  SeasonName,
} from "./types";

/**
 * Season from a start date: Nov–Jan Winter, Feb–Apr Spring, May–Jul Summer,
 * Aug–Oct Autumn, labelled with the year of the season's first month (so
 * January belongs to the Winter of the year before).
 */
export function seasonOf(d: IsoDate): Season {
  const year = Number(d.slice(0, 4));
  const month = Number(d.slice(5, 7));
  if (month === 1) return { name: "Winter", year: year - 1 };
  const names: SeasonName[] = ["Spring", "Summer", "Autumn", "Winter"];
  return { name: names[Math.floor((month - 2) / 3)], year };
}

const SUNDAY = 0;
const SATURDAY = 6;

/**
 * The weekly rule for Day Types (US-25), the default for every date of an
 * Occasion from `start` to `end`. Weeks run Sunday to Saturday; a segment is
 * the Occasion's dates in one week. Each segment of n days gets
 * r = min(2, n) RDOs (the week's two days off) and n − r Vacation days. The
 * PTO hugs the Saturday/Sunday break the time off crosses, with the RDOs on
 * the far side of it:
 * - within one week, or continuing into the next week only: RDOs first;
 * - continuing from the previous week only: Vacation first, RDOs last;
 * - both (a full week in the middle): ceil((n − 2) / 2) Vacation, the 2 RDOs,
 *   then Vacation.
 */
export function weeklyDayTypes(start: IsoDate, end: IsoDate): Record<IsoDate, DayType> {
  const types: Record<IsoDate, DayType> = {};
  const dates = datesInRange(start, end);
  for (let i = 0; i < dates.length; ) {
    const segment = [dates[i]];
    while (i + segment.length < dates.length && weekdayOf(dates[i + segment.length]) !== SUNDAY) {
      segment.push(dates[i + segment.length]);
    }
    i += segment.length;
    const n = segment.length;
    const rdos = Math.min(2, n);
    const fromPrevious = weekdayOf(segment[0]) === SUNDAY && segment[0] > start;
    const intoNext = weekdayOf(segment[n - 1]) === SATURDAY && segment[n - 1] < end;
    const leadingVacation = fromPrevious && intoNext ? Math.ceil((n - 2) / 2) : fromPrevious ? n - rdos : 0;
    segment.forEach((date, k) => {
      types[date] = k >= leadingVacation && k < leadingVacation + rdos ? "rdo" : "vacation";
    });
  }
  return types;
}

export function datesInRange(start: IsoDate, end: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

export const isPaid = (t: DayType): t is "vacation" | "floatingHoliday" =>
  t === "vacation" || t === "floatingHoliday";

/** Dates that two or more Occasions mark as Vacation or Floating Holiday, by date. */
export function findClashes(occasions: OccasionView[]): Clash[] {
  const byDate = new Map<IsoDate, ClashEntry[]>();
  for (const o of occasions) {
    for (const d of o.days) {
      if (!isPaid(d.dayType)) continue;
      const entries = byDate.get(d.date) ?? [];
      entries.push({ occasionId: o.id, occasionName: o.name, dayType: d.dayType });
      byDate.set(d.date, entries);
    }
  }
  return [...byDate]
    .filter(([, entries]) => entries.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({ date, entries }));
}

/**
 * Occasion views sorted by start date, with each date's Day Type resolved
 * (stored, or the weekly rule over the Occasion's range) and Deducted flagged
 * against the SAP Balance as-of date. Burning fills in the rest.
 */
export function occasionViews(occasions: Occasion[], asOf: IsoDate): OccasionView[] {
  return [...occasions]
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
    .map((o) => {
      const defaults = weeklyDayTypes(o.start, o.end);
      const days: DayOffView[] = datesInRange(o.start, o.end).map((date) => ({
        date,
        dayType: o.dayTypes[date] ?? defaults[date],
        deducted: paidBy(date, asOf),
        burns: null,
        unmet: false,
      }));
      return {
        id: o.id,
        name: o.name,
        start: o.start,
        end: o.end,
        days,
        ptoDays: days.filter((d) => isPaid(d.dayType)).length,
        unpaid: days.filter((d) => d.dayType === "unpaid").length,
        short: 0,
        season: seasonOf(o.start),
        deducted: days.length > 0 && days.every((d) => d.deducted),
        approved: o.approved === true,
      };
    });
}
