import { sapBalanceDays, weekdayOf } from "../engine";
import type { BenefitCounts, Clash, DayType, IsoDate, LedgerRow, RdoOverflow, Season } from "../engine";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(d: IsoDate) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, month: MONTHS[m - 1], day, weekday: WEEKDAYS[weekdayOf(d)] };
}

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/**
 * Occasion Dates: "Wed Sep 9 – Sat Sep 12", or "Wed Sep 9" for one day.
 * Given the current year, a date in any other year shows it, so a wrong year
 * can't go unnoticed: "Mon Mar 1 – Tue Mar 2, 2027", once when both share it.
 */
export function formatRange(start: IsoDate, end: IsoDate, currentYear?: number): string {
  const fmt = (d: IsoDate, withYear: boolean) => {
    const p = parts(d);
    return `${p.weekday} ${p.month} ${p.day}${withYear ? `, ${p.y}` : ""}`;
  };
  const other = (d: IsoDate) => currentYear !== undefined && parts(d).y !== currentYear;
  if (start === end) return fmt(start, other(start));
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${fmt(start, other(start) && !sameYear)} – ${fmt(end, other(end))}`;
}

/** Day editor row: "Tue, Nov 24th 2026". */
export function formatDayOff(d: IsoDate): string {
  const p = parts(d);
  return `${p.weekday}, ${p.month} ${ordinal(p.day)} ${p.y}`;
}

export function seasonLabel(season: Season): string {
  return `${season.name} ${season.year}`;
}

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  rdo: "RDO",
  floatingHoliday: "Floating Holiday",
  vacation: "Vacation",
  unpaid: "Unpaid",
};

/** "Sep 10 is already Vacation in 'Beach'", from the side of `occasionId`. */
export function clashMessage(clash: Clash, occasionId: string): string {
  const other = clash.entries.find((e) => e.occasionId !== occasionId) ?? clash.entries[0];
  const p = parts(clash.date);
  return `${p.month} ${p.day} is already ${DAY_TYPE_LABELS[other.dayType]} in '${other.occasionName}'`;
}

/**
 * US-29: "Too many RDOs: the week of Sun Mar 7 has 3 RDOs across 'A' and 'B'.
 * A week only has 2." ("in 'A'" for one Occasion). The week shows its year
 * when it isn't `currentYear`, like Occasion Dates.
 */
export function tooManyRdosMessage(w: RdoOverflow, currentYear?: number): string {
  const names = w.occasions.map((o) => `'${o.occasionName}'`);
  const listed = names.length === 1 ? `in ${names[0]}` : `across ${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `Too many RDOs: the week of ${formatRange(w.week, w.week, currentYear)} has ${w.dates.length} RDOs ${listed}. A week only has 2.`;
}

/** "Mar 5", or "Nov 12, 2025" when the date is outside the year group. */
export function formatEarnDate(d: IsoDate, groupYear: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const short = `${MONTHS[m - 1]} ${day}`;
  return y === groupYear ? short : `${short}, ${y}`;
}

/** "Vacation (Earned)", "Floating Holiday (Estimated)", or "Vacation (Previous Year)" for Carryover. */
export function typeLabel(row: Pick<LedgerRow, "benefitType" | "carryover" | "notYetEarned">): string {
  if (row.benefitType === "vacation" && row.carryover) return "Vacation (Previous Year)";
  const type = row.benefitType === "vacation" ? "Vacation" : "Floating Holiday";
  return `${type} (${row.notYetEarned ? "Estimated" : "Earned"})`;
}

export const floatingHolidays = (n: number) => (n === 1 ? "Floating Holiday" : "Floating Holidays");

/** Free days as one line: "Earned now: 5 Vacation, 2 Floating Holidays" or "By end of 2027: …". */
export function freeLine(label: string, free: BenefitCounts): string {
  return `${label}: ${free.vacation} Vacation, ${free.floatingHoliday} ${floatingHolidays(free.floatingHoliday)}`;
}

/** The CSS class that colors a Day Type or Benefit Type the same everywhere: "type-floating-holiday". */
export function typeClass(type: DayType): string {
  return type === "floatingHoliday" ? "type-floating-holiday" : `type-${type}`;
}

/** The CSS class that colors a Season: "season-spring". */
export function seasonClass(season: Season): string {
  return `season-${season.name.toLowerCase()}`;
}

/** Settings helper under an SAP hours field: "Counts as 5 days (3 hrs left over, less than a day)". */
export function sapBalanceNote(hours: number): string {
  const { days, leftoverHours } = sapBalanceDays(hours);
  const counts = `Counts as ${days} ${days === 1 ? "day" : "days"}`;
  if (leftoverHours === 0) return counts;
  return `${counts} (${leftoverHours} ${leftoverHours === 1 ? "hr" : "hrs"} left over, less than a day)`;
}

/** Full-year history mode: tells the user about rows marked Used (not listed), or null if none. */
export function usedNotListedMessage(used: BenefitCounts): string | null {
  const parts = [
    used.vacation > 0 && `${used.vacation} Vacation ${used.vacation === 1 ? "day" : "days"}`,
    used.floatingHoliday > 0 &&
      `${used.floatingHoliday} ${used.floatingHoliday === 1 ? "Floating Holiday" : "Floating Holidays"}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `SAP shows ${parts.join(" and ")} used that no listed Day Off explains. They're marked Used (not listed). Add the missing Days Off to fix this.`;
}
