import type { IsoDate } from "./types";

const DAY_MS = 86_400_000;

function toUtc(d: IsoDate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function isoDate(year: number, month: number, day: number): IsoDate {
  return fromUtc(new Date(Date.UTC(year, month - 1, day)));
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
  const firstOfTarget = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
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
