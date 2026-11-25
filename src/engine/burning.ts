import { yearOf } from "./dates";
import { isPaid } from "./occasions";
import { payday } from "./payday";
import { accrualTier } from "./schedule";
import type { BenefitCounts, DayOffView, IsoDate, LedgerRow, OccasionView } from "./types";

const HOURS_PER_DAY = 8;

const byKey = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** Burn order: oldest Earn Date first; ties put starting rows (and Carryover) first, then key. */
function burnOrder(a: LedgerRow, b: LedgerRow): number {
  return (
    a.earnDate.localeCompare(b.earnDate) ||
    Number(a.origin === "projected") - Number(b.origin === "projected") ||
    byKey(a.key, b.key)
  );
}

type Event =
  | { kind: "earn"; date: IsoDate; row: LedgerRow }
  | { kind: "dayOff"; date: IsoDate; occasion: OccasionView; day: DayOffView };

/**
 * Burning: one pass in date order, earning before Days Off on any date.
 *
 * - When a projected Vacation day is earned, it is Lost to cap if the
 *   SAP-terms Vacation balance just before it is at the cap (Art. 21 §5):
 *   8 × (Vacation rows earned and not lost − Burned Vacation Days Off paid
 *   by that date). SAP hours that don't make a whole day are ignored.
 * - Each paid Day Off Burns the oldest free Benefit Day of the same Benefit
 *   Type earned on or before its date. A Floating Holiday only Burns within
 *   its own calendar year. With nothing eligible, the Day Off goes unmet and
 *   adds to its Occasion's Short count. Nothing is borrowed from the future.
 * - Full-year history mode: this year's Deducted Days Off Burn first. Then,
 *   before any Day Off that isn't Deducted, the oldest of this year's rows in
 *   SAP that are still free are marked Used (not listed), as many of each type
 *   as SAP shows used that no listed Day Off explains.
 *
 * Mutates the rows and Occasion views it is given (fresh copies from computeView).
 */
export function burn(
  rows: LedgerRow[],
  occasions: OccasionView[],
  opts: {
    hireDate: IsoDate | null;
    /**
     * Full-year history mode: the year whose Deducted Days Off Burn too, and
     * how many of its rows in SAP to mark Used (not listed) once they have.
     */
    history: { year: number; usedNotListed: BenefitCounts } | null;
  },
): void {
  const historyYear = opts.history?.year ?? null;
  const events: Event[] = [
    ...[...rows].sort(burnOrder).map((row): Event => ({ kind: "earn", date: row.earnDate, row })),
    ...occasions.flatMap((occasion) =>
      occasion.days
        // Deducted Days Off are history: SAP already reflects them. In full-year
        // history mode, this year's Deducted ones take part too.
        .filter((day) => isPaid(day.dayType) && (!day.deducted || yearOf(day.date) === historyYear))
        .map((day): Event => ({ kind: "dayOff", date: day.date, occasion, day })),
    ),
  ];
  // Stable sort keeps Earn order within a date; earning sorts before Days Off.
  events.sort((a, b) => a.date.localeCompare(b.date) || Number(a.kind === "dayOff") - Number(b.kind === "dayOff"));

  /** Rows earned so far, in Burn order. */
  const earned: LedgerRow[] = [];
  let vacationEarned = 0;
  /** Paydays of Vacation Days Off Burned so far. */
  const vacationBurnPaydays: IsoDate[] = [];

  let usedNotListedMarked = opts.history === null;
  /** SAP shows these days gone: they Burn nothing and leave the Vacation Cap balance. */
  const markUsedNotListed = () => {
    usedNotListedMarked = true;
    for (const type of ["vacation", "floatingHoliday"] as const) {
      const stillFree = rows
        .filter((r) => r.benefitType === type && r.origin === "history" && !r.burnedBy && !r.usedNotListed)
        .sort(burnOrder)
        .slice(0, opts.history?.usedNotListed[type] ?? 0);
      for (const r of stillFree) {
        r.usedNotListed = true;
        if (type === "vacation" && earned.includes(r)) vacationEarned--;
      }
    }
  };

  for (const event of events) {
    // Paydays only move forward, so every Deducted Day Off comes before the
    // first one that isn't: here, all of this year's Deducted ones have Burned.
    if (!usedNotListedMarked && event.kind === "dayOff" && !event.day.deducted) markUsedNotListed();
    if (event.kind === "earn") {
      const { row } = event;
      // Used (not listed) rows are already gone in SAP: never earned, never Burned.
      if (row.usedNotListed) continue;
      if (row.benefitType === "vacation") {
        if (row.origin === "projected" && opts.hireDate) {
          const paidOut = vacationBurnPaydays.filter((p) => p <= row.earnDate).length;
          const balance = HOURS_PER_DAY * (vacationEarned - paidOut);
          if (balance >= accrualTier(opts.hireDate, yearOf(row.earnDate)).capHours) {
            row.lostToCap = true;
            continue;
          }
        }
        vacationEarned++;
      }
      earned.push(row);
      continue;
    }

    const { occasion, day } = event;
    const row = earned.find(
      (r) =>
        r.benefitType === day.dayType &&
        !r.burnedBy &&
        !r.usedNotListed &&
        (r.benefitType === "vacation" || yearOf(r.earnDate) === yearOf(day.date)),
    );
    if (row) {
      row.burnedBy = { occasionId: occasion.id, occasionName: occasion.name, date: day.date };
      day.burns = row.key;
      if (row.benefitType === "vacation") vacationBurnPaydays.push(payday(day.date));
    } else {
      day.unmet = true;
      occasion.short++;
    }
  }
  if (!usedNotListedMarked) markUsedNotListed();
}
