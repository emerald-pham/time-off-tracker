import type { BenefitCounts, IsoDate, LedgerRow } from "../engine";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

export function leftoverNote(hours: number): string | null {
  return hours > 0 ? `+${hours} hrs` : null;
}
