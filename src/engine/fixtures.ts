import { addDays, weekdayOf } from "./dates";
import type { DayType, IsoDate, Settings } from "./types";

/**
 * "Sam", the spec's made-up fixture: hired Aug 14, 2024, 40 hours a week,
 * saved since the weekly rule (US-25), so no regular days off. Not a real
 * person.
 */
export const sam: Settings = {
  hireDate: "2024-08-14",
  weeklyHours: 40,
  regularDaysOff: [],
  sapVacationHours: 0,
  sapFloatingHolidayHours: 0,
  sapAsOf: null,
  fullYearHistory: false,
};

/**
 * Day Types as chosen in the day editor, for tests about Burning rather than
 * defaults: Vacation Monday to Friday and RDO on Saturday and Sunday, with
 * `overrides` on top.
 */
export function vacationOnWeekdays(
  start: IsoDate,
  end: IsoDate,
  overrides: Record<IsoDate, DayType> = {},
): Record<IsoDate, DayType> {
  const types: Record<IsoDate, DayType> = {};
  for (let d = start; d <= end; d = addDays(d, 1)) {
    types[d] = weekdayOf(d) === 0 || weekdayOf(d) === 6 ? "rdo" : "vacation";
  }
  return { ...types, ...overrides };
}
