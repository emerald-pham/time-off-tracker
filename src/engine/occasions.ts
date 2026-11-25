import { addDays, weekdayOf } from "./dates";
import type { DayOffView, DayType, IsoDate, Occasion, OccasionView, Season, SeasonName, Settings } from "./types";

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

/** Occasion views sorted by start date, with each date's Day Type resolved. Burning fills in the rest. */
export function occasionViews(occasions: Occasion[], settings: Settings): OccasionView[] {
  return [...occasions]
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
    .map((o) => {
      const days: DayOffView[] = datesInRange(o.start, o.end).map((date) => ({
        date,
        dayType: o.dayTypes[date] ?? defaultDayType(date, settings),
        deducted: false,
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
        deducted: false,
      };
    });
}
