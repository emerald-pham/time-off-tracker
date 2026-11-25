import { sapBalanceDays, weekdayOf } from "../engine";
import type { BenefitCounts, Clash, DayType, IsoDate, LedgerRow, Season } from "../engine";

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

/** Occasion Dates: "Wed Sep 9 – Sat Sep 12", or "Wed Sep 9" for one day. */
export function formatRange(start: IsoDate, end: IsoDate): string {
  const fmt = (d: IsoDate) => {
    const p = parts(d);
    return `${p.weekday} ${p.month} ${p.day}`;
  };
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
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

/** "Mar 5", or "Nov 12, 2025" when the date is outside the year group. */
export function formatEarnDate(d: IsoDate, groupYear: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const short = `${MONTHS[m - 1]} ${day}`;
  return y === groupYear ? short : `${short}, ${y}`;
}

export function typeLabel(row: Pick<LedgerRow, "benefitType" | "carryover">): string {
  if (row.benefitType === "floatingHoliday") return "Floating Holiday";
  return row.carryover ? "Vacation (Previous Year)" : "Vacation";
}

export function freeSummary(free: BenefitCounts): string {
  const fh = free.floatingHoliday === 1 ? "Floating Holiday" : "Floating Holidays";
  return `Free: ${free.vacation} Vacation, ${free.floatingHoliday} ${fh}`;
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
