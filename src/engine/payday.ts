import { addDays, weekdayOf } from "./dates";
import type { IsoDate } from "./types";

/**
 * Payday for a date: the Sunday on or before it (start of its Payroll Week)
 * plus 11 days, a Thursday.
 */
export function payday(d: IsoDate): IsoDate {
  return addDays(d, 11 - weekdayOf(d));
}

/**
 * Whether something dated `d` is reflected in the SAP Balance read on `asOf`.
 * A Day Off is Deducted, and a projected Vacation day is in SAP, once its
 * Payday is on or before the as-of date.
 */
export function paidBy(d: IsoDate, asOf: IsoDate): boolean {
  return payday(d) <= asOf;
}
