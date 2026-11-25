import type { EarnDateEdits, IsoDate, ScheduleKey } from "../engine";

/** Stores an Earn Date edit against a row's schedule key. */
export function setEarnDate(edits: EarnDateEdits, key: ScheduleKey, date: IsoDate): EarnDateEdits {
  return { ...edits, [key]: date };
}

/** "Reset to projected": deletes the edit for a key. */
export function resetEarnDate(edits: EarnDateEdits, key: ScheduleKey): EarnDateEdits {
  const { [key]: _removed, ...rest } = edits;
  return rest;
}
