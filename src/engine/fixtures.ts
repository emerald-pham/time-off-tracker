import type { Settings } from "./types";

/**
 * "Sam", the spec's made-up fixture: hired Aug 14, 2024, 40 hours a week,
 * regular days off Saturday and Sunday. Not a real person.
 */
export const sam: Settings = {
  hireDate: "2024-08-14",
  weeklyHours: 40,
  regularDaysOff: [0, 6],
  sapVacationHours: 0,
  sapFloatingHolidayHours: 0,
  sapAsOf: null,
  fullYearHistory: false,
};
