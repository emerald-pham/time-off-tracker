/**
 * Shared pieces for the user story acceptance tests. Everyone here is made up:
 * "Sam" and "Lee" are the spec's fictional cast members.
 */
import { computeView } from "../../src/engine";
import type { EngineInput, LedgerRow, Occasion, Settings, ViewModel } from "../../src/engine";
import { sam } from "../../src/engine/fixtures";

export { sam };

/** Sam's SAP Balance from the spec's E2: 40 h Vacation and 8 h Floating Holiday, read Mon Nov 24, 2025. */
export const samE2: Settings = { ...sam, sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2025-11-24" };

/** "Lee", hired Mar 3, 2015 (spec E7). */
export const lee: Settings = { ...sam, hireDate: "2015-03-03" };

export function view(
  settings: Settings,
  today: string,
  more: Partial<Omit<EngineInput, "settings" | "today">> = {},
): ViewModel {
  return computeView({ settings, occasions: [], earnDateEdits: {}, today, ...more });
}

export function occasion(id: string, name: string, start: string, end: string, dayTypes: Occasion["dayTypes"] = {}): Occasion {
  return { id, name, start, end, dayTypes };
}

export const rowsOf = (v: ViewModel): LedgerRow[] => v.ledger.groups.flatMap((g) => g.rows);

export const rowByKey = (v: ViewModel, key: string): LedgerRow | undefined => rowsOf(v).find((r) => r.key === key);

export const vacationRows = (rows: LedgerRow[]) => rows.filter((r) => r.benefitType === "vacation");

export const floatingHolidayRows = (rows: LedgerRow[]) => rows.filter((r) => r.benefitType === "floatingHoliday");
