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
  Weekday,
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
 * - both (a full week in the middle): ceil((n − r) / 2) Vacation, the r RDOs,
 *   then Vacation.
 *
 * A week has two days off in total, shared by every Occasion in it: `held`
 * lists the dates other Occasions already hold as RDO, and a segment gets
 * only what's left, r = min(n, max(0, 2 − held dates in its week outside it)).
 */
export function weeklyDayTypes(
  start: IsoDate,
  end: IsoDate,
  held: Iterable<IsoDate> = [],
): Record<IsoDate, DayType> {
  const types: Record<IsoDate, DayType> = {};
  const dates = datesInRange(start, end);
  const heldByWeek = new Map<IsoDate, Set<IsoDate>>();
  for (const d of held) heldByWeek.set(weekOf(d), (heldByWeek.get(weekOf(d)) ?? new Set<IsoDate>()).add(d));
  for (let i = 0; i < dates.length; ) {
    const segment = [dates[i]];
    while (i + segment.length < dates.length && weekdayOf(dates[i + segment.length]) !== SUNDAY) {
      segment.push(dates[i + segment.length]);
    }
    i += segment.length;
    const n = segment.length;
    const heldElsewhere = [...(heldByWeek.get(weekOf(segment[0])) ?? [])].filter((d) => !segment.includes(d)).length;
    const rdos = Math.min(n, Math.max(0, 2 - heldElsewhere));
    const fromPrevious = weekdayOf(segment[0]) === SUNDAY && segment[0] > start;
    const intoNext = weekdayOf(segment[n - 1]) === SATURDAY && segment[n - 1] < end;
    const leadingVacation = fromPrevious && intoNext ? Math.ceil((n - rdos) / 2) : fromPrevious ? n - rdos : 0;
    segment.forEach((date, k) => {
      types[date] = k >= leadingVacation && k < leadingVacation + rdos ? "rdo" : "vacation";
    });
  }
  return types;
}

/** The default before the weekly rule: RDO on the regular days off, Vacation otherwise (US-18). */
function legacyDayTypes(dates: IsoDate[], regularDaysOff: readonly Weekday[]): Record<IsoDate, DayType> {
  return Object.fromEntries(
    dates.map((d) => [d, regularDaysOff.includes(weekdayOf(d) as Weekday) ? "rdo" : "vacation"]),
  );
}

/** The Sunday that starts `d`'s week. */
export const weekOf = (d: IsoDate): IsoDate => addDays(d, -weekdayOf(d));

/** The dates these Occasions have as RDO, for `weeklyDayTypes`' `held`. */
export function rdoDates(occasions: { days: { date: IsoDate; dayType: DayType }[] }[]): IsoDate[] {
  return occasions.flatMap((o) => o.days.filter((d) => d.dayType === "rdo").map((d) => d.date));
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
 *
 * A week's two days off are shared between Occasions: missing types are
 * worked out in start-date order, counting the RDOs every other Occasion
 * holds (stored, or already worked out).
 *
 * Saved data from before the weekly rule (US-18): while the stored
 * `regularDaysOff` is non-empty, a missing type gets the old default instead,
 * RDO on those weekdays and Vacation otherwise. The app now stores every
 * date's type, so only older saves have missing ones.
 */
export function occasionViews(
  occasions: Occasion[],
  asOf: IsoDate,
  regularDaysOff: readonly Weekday[] = [],
): OccasionView[] {
  const sorted = [...occasions].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const rdosHeld = new Map(
    sorted.map((o) => [o.id, datesInRange(o.start, o.end).filter((d) => o.dayTypes[d] === "rdo")]),
  );
  const heldByOthers = (id: string) => sorted.filter((o) => o.id !== id).flatMap((o) => rdosHeld.get(o.id)!);
  return sorted.map((o) => {
    const dates = datesInRange(o.start, o.end);
    const defaults: Record<IsoDate, DayType> = dates.every((d) => o.dayTypes[d])
      ? {}
      : regularDaysOff.length > 0
        ? legacyDayTypes(dates, regularDaysOff)
        : weeklyDayTypes(o.start, o.end, heldByOthers(o.id));
    const days: DayOffView[] = dates.map((date) => ({
      date,
      dayType: o.dayTypes[date] ?? defaults[date],
      deducted: paidBy(date, asOf),
      burns: null,
      unmet: false,
    }));
    rdosHeld.set(o.id, rdoDates([{ days }]));
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
      floatingHolidaysCouldCover: [],
    };
  });
}
