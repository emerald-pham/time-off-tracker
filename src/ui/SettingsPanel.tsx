import { useEffect, useState } from "react";
import type { IsoDate, Settings, Weekday } from "../engine";

const WEEKDAYS: { day: Weekday; label: string }[] = [
  { day: 0, label: "Sun" },
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
];

interface Props {
  settings: Settings;
  today: IsoDate;
  onChange: (settings: Settings) => void;
}

export function SettingsPanel({ settings, today, onChange }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  // The SAP Balance as-of date is stamped with today whenever a balance changes.
  const setBalance = (patch: Partial<Settings>) => set({ ...patch, sapAsOf: today });

  const toggleDay = (day: Weekday, on: boolean) =>
    set({
      regularDaysOff: on
        ? [...settings.regularDaysOff, day].sort((a, b) => a - b)
        : settings.regularDaysOff.filter((d) => d !== day),
    });

  return (
    <form className="settings" onSubmit={(e) => e.preventDefault()}>
      <label className="field">
        <span>Hire date</span>
        <input
          type="date"
          value={settings.hireDate ?? ""}
          onChange={(e) => set({ hireDate: e.target.value || null })}
        />
      </label>

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
        onChange={(weeklyHours) => set({ weeklyHours })}
      />

      <h3 className="settings-heading">SAP Balance</h3>
      <NumberField
        label="SAP Vacation hours"
        value={settings.sapVacationHours}
        onChange={(sapVacationHours) => setBalance({ sapVacationHours })}
      />
      <NumberField
        label="SAP Floating Holiday hours"
        value={settings.sapFloatingHolidayHours}
        onChange={(sapFloatingHolidayHours) => setBalance({ sapFloatingHolidayHours })}
      />
      <label className="field">
        <span>SAP Balance as-of date</span>
        <input
          type="date"
          value={settings.sapAsOf ?? today}
          onChange={(e) => set({ sapAsOf: e.target.value || null })}
        />
      </label>
    </form>
  );
}

/** A number input that lets the field be blank while typing. */
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // Only resync when the stored value changes from outside.
  }, [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n) && n >= 0) onChange(n);
        }}
      />
    </label>
  );
}
