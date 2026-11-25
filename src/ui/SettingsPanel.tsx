import { useEffect, useState } from "react";
import { FIRST_SUPPORTED_YEAR, LAST_SUPPORTED_YEAR, isSupportedDate } from "../engine";
import type { IsoDate, Settings, Weekday } from "../engine";
import { BALANCE_HOURS, WEEKLY_HOURS } from "../storage";
import { FullYearHistoryToggle } from "./FullYearHistoryToggle";

const WEEKDAYS: { day: Weekday; label: string }[] = [
  { day: 0, label: "Sun" },
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
];

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

  const toggleDay = (day: Weekday, on: boolean) =>
    set({
      regularDaysOff: on
        ? [...settings.regularDaysOff, day].sort((a, b) => a - b)
        : settings.regularDaysOff.filter((d) => d !== day),
    });

  return (
    <form className="settings" onSubmit={(e) => e.preventDefault()}>
      <DateField
        label="Hire date"
        value={settings.hireDate}
        onChange={setHireDate}
        onClear={() => set({ hireDate: null })}
      />

      <fieldset className="field weekdays">
        <legend>Regular days off</legend>
        <div className="weekday-list">
          {WEEKDAYS.map(({ day, label }) => (
            <label key={day} className="weekday">
              <input
                type="checkbox"
                checked={settings.regularDaysOff.includes(day)}
                onChange={(e) => toggleDay(day, e.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

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
        onChange={(sapVacationHours) => setBalance({ sapVacationHours })}
      />
      <NumberField
        label="SAP Floating Holiday hours"
        value={settings.sapFloatingHolidayHours}
        range={BALANCE_HOURS}
        whenBlank={0}
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
 * A number input that lets the field be blank, or out of range, while
 * typing. Only a value within `range` is saved as it's typed. On leaving the
 * field, an out-of-range value is clamped and saved; a blank one saves
 * `whenBlank` if given, or else puts back the saved value.
 */
function NumberField({
  label,
  value,
  range,
  whenBlank,
  onChange,
}: {
  label: string;
  value: number;
  range: { min: number; max: number };
  whenBlank?: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
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
        type="number"
        inputMode="decimal"
        min={range.min}
        max={range.max}
        step="any"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n) && n >= range.min && n <= range.max) onChange(n);
        }}
        onBlur={() => {
          const n = Number(text);
          if (text.trim() === "" || !Number.isFinite(n)) {
            if (whenBlank !== undefined) commit(whenBlank);
            else setText(String(value));
            return;
          }
          commit(Math.min(range.max, Math.max(range.min, n)));
        }}
      />
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
  useEffect(() => {
    setText(value ?? "");
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
        onChange={(e) => {
          setText(e.target.value);
          if (isSupportedDate(e.target.value) && e.target.value !== value) onChange(e.target.value);
          else if (e.target.value === "" && onClear && value !== null) onClear();
        }}
        onBlur={() => {
          if (!isSupportedDate(text) && !(text === "" && onClear)) setText(value ?? "");
        }}
      />
    </label>
  );
}
