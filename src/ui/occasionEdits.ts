import { approvedDates, computeView, datesInRange, weekOf, weeklyDayTypes, withApprovedDays } from "../engine";
import { addMonthsClamped } from "../engine/dates";
import type { Clash, DayType, IsoDate, Occasion, OccasionView } from "../engine";
import type { AppData } from "../storage";
import { clashMessage } from "./format";

/**
 * Moves an Occasion's range (US-25). If its Day Types are what the weekly
 * rule gives its old range (the person never customized them), the whole new
 * range gets the rule's types. Otherwise dates still in range keep their
 * type, and added dates get the type the rule gives them over the new range.
 * `held` is the RDO dates other Occasions hold: a week's two days off are
 * shared between them.
 *
 * Approval (US-23): dates still in range stay approved, and added dates
 * start unapproved.
 */
export function withRange(o: Occasion, start: IsoDate, end: IsoDate, held: IsoDate[] = []): Occasion {
  return withApprovedDays(withRangeTypes(o, start, end, held), approvedDates(o));
}

function withRangeTypes(o: Occasion, start: IsoDate, end: IsoDate, held: IsoDate[]): Occasion {
  const oldRule = weeklyDayTypes(o.start, o.end, held);
  const newRule = weeklyDayTypes(start, end, held);
  const customized = Object.entries(oldRule).some(([date, type]) => (o.dayTypes[date] ?? type) !== type);
  if (!customized) return { ...o, start, end, dayTypes: newRule };
  const kept = (date: IsoDate) => o.dayTypes[date] !== undefined;
  // A week has two days off: the person's kept RDOs and other Occasions' come first,
  // and any RDO the rule gives an added date beyond that becomes Vacation.
  const taken = new Map<IsoDate, Set<IsoDate>>();
  const take = (date: IsoDate) => taken.set(weekOf(date), (taken.get(weekOf(date)) ?? new Set<IsoDate>()).add(date));
  for (const date of held) take(date);
  for (const date of Object.keys(newRule)) if (kept(date) && o.dayTypes[date] === "rdo") take(date);
  const dayTypes: Record<IsoDate, DayType> = {};
  for (const [date, type] of Object.entries(newRule).sort(([a], [b]) => a.localeCompare(b))) {
    if (kept(date)) {
      dayTypes[date] = o.dayTypes[date];
    } else if (type !== "rdo" || taken.get(weekOf(date))?.has(date)) {
      dayTypes[date] = type;
    } else if ((taken.get(weekOf(date))?.size ?? 0) < 2) {
      take(date);
      dayTypes[date] = type;
    } else {
      dayTypes[date] = "vacation";
    }
  }
  return { ...o, start, end, dayTypes };
}

/** The same date `years` later (Feb 29 becomes Feb 28 in a year without one). */
const yearsLater = (d: IsoDate, years: number) => addMonthsClamped(d, 12 * years);

/** US-10: how many years forward the dates must move to end on or after today (at least one). */
export function yearsToMove(o: Pick<Occasion, "start" | "end">, today: IsoDate): number {
  let years = 1;
  while (yearsLater(o.end, years) < today) years++;
  return years;
}

/**
 * US-10: the Occasion's dates `years` later. Floating Holiday and Unpaid days
 * are the person's choices, so they move to the same place in the range (by
 * day index from the start); the weekly rule (US-25) sets RDO and Vacation
 * for the rest, sharing each week's two days off with the `held` RDO dates
 * of other Occasions. Each day's approval (US-23) moves by day index too.
 */
export function movedForward(o: Occasion, years: number, held: IsoDate[] = []): Occasion {
  const start = yearsLater(o.start, years);
  const end = yearsLater(o.end, years);
  const dayTypes = weeklyDayTypes(start, end, held);
  const before = datesInRange(o.start, o.end);
  const after = datesInRange(start, end);
  after.forEach((date, i) => {
    const chosen = o.dayTypes[before[i]];
    if (chosen === "floatingHoliday" || chosen === "unpaid") dayTypes[date] = chosen;
  });
  const approved = new Set(approvedDates(o));
  return withApprovedDays(
    { ...o, start, end, dayTypes },
    after.filter((_, i) => approved.has(before[i])),
  );
}

export interface OccasionCheck {
  /** The candidate as the engine sees it, with defaults resolved. */
  view: OccasionView;
  /** Clashes involving the candidate. Saving is refused while any remain. */
  clashes: Clash[];
  messages: string[];
}

/**
 * Runs the engine with `candidate` in place of its saved version (or added,
 * if new) to resolve its Day Types and find any Clash before saving.
 */
export function checkOccasion(data: AppData, today: IsoDate, candidate: Occasion): OccasionCheck {
  const occasions = [...data.occasions.filter((o) => o.id !== candidate.id), candidate];
  const view = computeView({ ...data, occasions, today });
  const clashes = view.clashes.filter((c) => c.entries.some((e) => e.occasionId === candidate.id));
  return {
    view: view.occasions.find((o) => o.id === candidate.id)!,
    clashes,
    messages: clashes.map((c) => clashMessage(c, candidate.id)),
  };
}

/** The candidate with every date's resolved Day Type stored, so later default changes don't move it. */
export function withResolvedTypes(candidate: Occasion, view: OccasionView): Occasion {
  return { ...candidate, dayTypes: Object.fromEntries(view.days.map((d) => [d.date, d.dayType])) };
}
