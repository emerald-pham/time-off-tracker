import { yearOf } from "./dates";
import { isPaid } from "./occasions";
import { payday } from "./payday";
import { accrualTier } from "./schedule";
import type { DayOffView, IsoDate, LedgerRow, OccasionView } from "./types";

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
 *   leftover hours + 8 × (Vacation rows earned and not lost − Burned
 *   Vacation Days Off paid by that date).
 * - Each paid Day Off Burns the oldest free Benefit Day of the same Benefit
 *   Type earned on or before its date. A Floating Holiday only Burns within
 *   its own calendar year. With nothing eligible, the Day Off goes unmet and
 *   adds to its Occasion's Short count. Nothing is borrowed from the future.
 *
 * Mutates the rows and Occasion views it is given (fresh copies from computeView).
 */
export function burn(
  rows: LedgerRow[],
  occasions: OccasionView[],
  opts: {
    hireDate: IsoDate | null;
    leftoverVacationHours: number;
    /** Full-year history mode: the year whose Deducted Days Off Burn too. */
    historyYear: number | null;
  },
): void {
  const events: Event[] = [
    ...[...rows].sort(burnOrder).map((row): Event => ({ kind: "earn", date: row.earnDate, row })),
    ...occasions.flatMap((occasion) =>
      occasion.days
        // Deducted Days Off are history: SAP already reflects them. In full-year
        // history mode, this year's Deducted ones take part too.
        .filter(
          (day) =>
            isPaid(day.dayType) && (!day.deducted || yearOf(day.date) === opts.historyYear),
        )
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

  for (const event of events) {
    if (event.kind === "earn") {
      const { row } = event;
      // Used (not listed) rows are already gone in SAP: never earned, never Burned.
      if (row.usedNotListed) continue;
      if (row.benefitType === "vacation") {
        if (row.origin === "projected" && opts.hireDate) {
          const paidOut = vacationBurnPaydays.filter((p) => p <= row.earnDate).length;
          const balance = opts.leftoverVacationHours + HOURS_PER_DAY * (vacationEarned - paidOut);
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
}
