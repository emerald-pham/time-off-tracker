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
  Settings,
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

/** A new date is RDO on a regular day off, and Vacation otherwise. */
export function defaultDayType(d: IsoDate, settings: Settings): DayType {
  return settings.regularDaysOff.includes(weekdayOf(d) as Settings["regularDaysOff"][number])
    ? "rdo"
    : "vacation";
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
 * Occasion views sorted by start date, with each date's Day Type resolved and
 * Deducted flagged against the SAP Balance as-of date. Burning fills in the rest.
 */
export function occasionViews(occasions: Occasion[], settings: Settings, asOf: IsoDate): OccasionView[] {
  return [...occasions]
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
    .map((o) => {
      const days: DayOffView[] = datesInRange(o.start, o.end).map((date) => ({
        date,
        dayType: o.dayTypes[date] ?? defaultDayType(date, settings),
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
