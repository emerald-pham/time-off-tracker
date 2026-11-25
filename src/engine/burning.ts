import { yearOf } from "./dates";
import { isPaid } from "./occasions";
import type { LedgerRow, OccasionView } from "./types";

const byKey = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** Burn order: oldest Earn Date first; ties put starting rows (and Carryover) first, then key. */
function burnOrder(a: LedgerRow, b: LedgerRow): number {
  return (
    a.earnDate.localeCompare(b.earnDate) ||
    Number(a.origin === "projected") - Number(b.origin === "projected") ||
    byKey(a.key, b.key)
  );
}

/**
 * Burning: one pass in date order. Each paid Day Off Burns the oldest free
 * Benefit Day of the same Benefit Type earned on or before its date. A
 * Floating Holiday only Burns within its own calendar year. A Day Off with
 * nothing eligible goes unmet and adds to its Occasion's Short count.
 *
 * Mutates the rows and Occasion views it is given (fresh copies from computeView).
 */
export function burn(rows: LedgerRow[], occasions: OccasionView[]): void {
  const ordered = [...rows].sort(burnOrder);
  const daysOff = occasions
    .flatMap((occasion) => occasion.days.map((day) => ({ occasion, day })))
    .filter(({ day }) => isPaid(day.dayType))
    .sort((a, b) => a.day.date.localeCompare(b.day.date));

  for (const { occasion, day } of daysOff) {
    const row = ordered.find(
      (r) =>
        r.benefitType === day.dayType &&
        !r.burnedBy &&
        r.earnDate <= day.date &&
        (r.benefitType === "vacation" || yearOf(r.earnDate) === yearOf(day.date)),
    );
    if (row) {
      row.burnedBy = { occasionId: occasion.id, occasionName: occasion.name, date: day.date };
      day.burns = row.key;
    } else {
      day.unmet = true;
      occasion.short++;
    }
  }
}
