import { useEffect, useId, useRef, useState } from "react";
import { FIRST_SUPPORTED_YEAR, LAST_SUPPORTED_YEAR, isSupportedDate } from "../engine";
import type { IsoDate, Settings } from "../engine";
import { BALANCE_HOURS, WEEKLY_HOURS } from "../storage";
import { FullYearHistoryToggle } from "./FullYearHistoryToggle";
import { sapBalanceNote } from "./format";

const FIRST_DATE = `${FIRST_SUPPORTED_YEAR}-01-01`;
const LAST_DATE = `${LAST_SUPPORTED_YEAR}-12-31`;

interface Props {
  settings: Settings;
  today: IsoDate;
  onChange: (settings: Settings) => void;
}

export function SettingsPanel({ settings, today, onChange }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  // The SAP Balance as-of date is stamped with today whenever a balance changes.
  const setBalance = (patch: Partial<Settings>) => set({ ...patch, sapAsOf: today });
  // It's never blank once the hire date is in: entering one stamps it with
  // today if it had no date yet, so the balance doesn't drift with the calendar.
  const setHireDate = (hireDate: IsoDate) => set({ hireDate, sapAsOf: settings.sapAsOf ?? today });
  // Regular days off are no longer asked for: the weekly rule (US-25) decides
  // the RDOs. The stored field is kept as it is, so older saves still load.

  return (
    <form className="settings" onSubmit={(e) => e.preventDefault()}>
      <DateField
        label="Hire date"
        value={settings.hireDate}
        onChange={setHireDate}
        onClear={() => set({ hireDate: null })}
      />

      <NumberField
        label="Weekly hours"
        value={settings.weeklyHours}
        range={WEEKLY_HOURS}
        onChange={(weeklyHours) => set({ weeklyHours })}
      />

      <h3 className="settings-heading">SAP Balance</h3>
      <NumberField
        label="SAP Vacation hours"
        value={settings.sapVacationHours}
        range={BALANCE_HOURS}
        whenBlank={0}
        hint={sapBalanceNote}
        onChange={(sapVacationHours) => setBalance({ sapVacationHours })}
      />
      <NumberField
        label="SAP Floating Holiday hours"
        value={settings.sapFloatingHolidayHours}
        range={BALANCE_HOURS}
        whenBlank={0}
        hint={sapBalanceNote}
        onChange={(sapFloatingHolidayHours) => setBalance({ sapFloatingHolidayHours })}
      />
      <DateField
        label="SAP Balance as-of date"
        value={settings.sapAsOf ?? today}
        onChange={(sapAsOf) => set({ sapAsOf })}
      />

      <FullYearHistoryToggle
        checked={settings.fullYearHistory}
        onChange={(fullYearHistory) => set({ fullYearHistory })}
      />
    </form>
  );
}

/**
 * Tracks whether someone is in a field and has typed since they entered it.
 * While they're in it, the field shows what they typed, never the stored
 * value: a save's own snapshot can arrive after the next keystroke, and
 * putting its older value back mid-typing turns "1234" into "124". On
 * leaving, a field nobody typed in shows the stored value, which may have
 * changed on another device meanwhile, without saving anything.
 */
function useEditing() {
  const inField = useRef(false);
  const typed = useRef(false);
  return {
    get inField() {
      return inField.current;
    },
    enter() {
      inField.current = true;
      typed.current = false;
    },
    typing() {
      typed.current = true;
    },
    /** Leaves the field; true if something was typed since entering it. */
    leave() {
      inField.current = false;
      const wasTyped = typed.current;
      typed.current = false;
      return wasTyped;
    },
  };
}

/** Hours as a person types them: digits with at most one ".", like "44", "44.5", "44." or ".5". */
const HOURS = /^\s*(\d+\.?\d*|\.\d+)\s*$/;

/** The number typed, or NaN for anything else (blank included). */
const parseHours = (typed: string): number => (HOURS.test(typed) ? Number(typed) : NaN);

/**
 * A number input that lets the field be blank, or out of range, while
 * typing. Only a value within `range` is saved as it's typed. On leaving the
 * field, an out-of-range value is clamped and saved; a blank one saves
 * `whenBlank` if given, or else puts back the saved value, and anything that
 * isn't a number puts back the saved value. A `hint` about the saved value
 * shows under the field.
 *
 * It's a text field with the decimal keypad, not `type="number"` (US-28): a
 * number field reports "" for what it can't read yet, such as "44." partway
 * through "44.5", so leaving it there looked like a cleared field and saved 0
 * over the balance.
 */
function NumberField({
  label,
  value,
  range,
  whenBlank,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  range: { min: number; max: number };
  whenBlank?: number;
  hint?: (value: number) => string;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const editing = useEditing();
  const hintId = useId();
  useEffect(() => {
    if (!editing.inField && Number(text) !== value) setText(String(value));
    // Only resync when the stored value changes from outside.
  }, [value]);

  const commit = (n: number) => {
    if (n !== value) onChange(n);
    setText(String(n));
  };

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-describedby={hint ? hintId : undefined}
        value={text}
        onFocus={editing.enter}
        onChange={(e) => {
          editing.typing();
          setText(e.target.value);
          const n = parseHours(e.target.value);
          if (Number.isFinite(n) && n >= range.min && n <= range.max) onChange(n);
        }}
        onBlur={() => {
          if (!editing.leave()) {
            setText(String(value));
            return;
          }
          if (text.trim() === "" && whenBlank !== undefined) {
            commit(whenBlank);
            return;
          }
          const n = parseHours(text);
          if (!Number.isFinite(n)) {
            setText(String(value));
            return;
          }
          commit(Math.min(range.max, Math.max(range.min, n)));
        }}
      />
      {hint && (
        <small id={hintId} className="field-hint">
          {hint(value)}
        </small>
      )}
    </label>
  );
}

/**
 * A date input that saves only real dates from 1950 to 2100. A date field
 * passes through years like 0002 and 0020 while a year is typed, so those are
 * held in the field rather than saved. Leaving the field on anything else
 * puts the saved date back, unless the field may be cleared (`onClear`).
 */
function DateField({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: IsoDate | null;
  onChange: (date: IsoDate) => void;
  onClear?: () => void;
}) {
  const [text, setText] = useState(value ?? "");
  const editing = useEditing();
  useEffect(() => {
    if (!editing.inField) setText(value ?? "");
  }, [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="date"
        min={FIRST_DATE}
        max={LAST_DATE}
        required={!onClear}
        value={text}
        onFocus={editing.enter}
        onChange={(e) => {
          editing.typing();
          setText(e.target.value);
          if (isSupportedDate(e.target.value) && e.target.value !== value) onChange(e.target.value);
          else if (e.target.value === "" && onClear && value !== null) onClear();
        }}
        onBlur={() => {
          const typed = editing.leave();
          if (!typed || (!isSupportedDate(text) && !(text === "" && onClear))) setText(value ?? "");
        }}
      />
    </label>
  );
}
