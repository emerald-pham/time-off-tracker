import { computeView } from "../engine";
import type { Clash, DayType, IsoDate, Occasion, OccasionView } from "../engine";
import type { AppData } from "../storage";
import { clashMessage } from "./format";

/** Moves an Occasion's range: dates still in range keep their type; added dates get defaults. */
export function withRange(o: Occasion, start: IsoDate, end: IsoDate): Occasion {
  const dayTypes: Record<IsoDate, DayType> = {};
  for (const [date, type] of Object.entries(o.dayTypes)) {
    if (date >= start && date <= end) dayTypes[date] = type;
  }
  return { ...o, start, end, dayTypes };
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
