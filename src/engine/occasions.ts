import type { IsoDate, Season, SeasonName } from "./types";

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
