import type { IsoDate } from "./types";

const DAY_MS = 86_400_000;

/** The years the app accepts for any date it saves (hire, as-of, Occasion and Earn Dates). */
export const FIRST_SUPPORTED_YEAR = 1950;
export const LAST_SUPPORTED_YEAR = 2100;

/**
 * Midnight UTC on a calendar date. `setUTCFullYear` keeps years 0–99 as
 * written; `Date.UTC` would read them as 1900–1999.
 */
function utc(year: number, monthIndex: number, day: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, monthIndex, day);
  return d;
}

function toUtc(d: IsoDate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return utc(y, m - 1, day);
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function isoDate(year: number, month: number, day: number): IsoDate {
  return fromUtc(utc(year, month - 1, day));
}

export function yearOf(d: IsoDate): number {
  return Number(d.slice(0, 4));
}

export function addDays(d: IsoDate, days: number): IsoDate {
  return fromUtc(new Date(toUtc(d).getTime() + days * DAY_MS));
}

/** Adds months, clamping to the last day of a shorter month (May 31 + 9 months -> Feb 28/29). */
export function addMonthsClamped(d: IsoDate, months: number): IsoDate {
  const t = toUtc(d);
  const day = t.getUTCDate();
  const firstOfTarget = utc(t.getUTCFullYear(), t.getUTCMonth() + months, 1);
  const lastDay = utc(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(day, lastDay));
  return fromUtc(firstOfTarget);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(d: IsoDate): number {
  return toUtc(d).getUTCDay();
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/**
 * True for a real calendar date written "YYYY-MM-DD" with a year from 1950 to
 * 2100. Anything else (a two-digit year typed into a date field, Feb 30, a
 * value from a damaged save) is refused before it's saved or used.
 */
export function isSupportedDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = yearOf(value);
  if (year < FIRST_SUPPORTED_YEAR || year > LAST_SUPPORTED_YEAR) return false;
  const [y, m, day] = value.split("-").map(Number);
  return isoDate(y, m, day) === value;
}
