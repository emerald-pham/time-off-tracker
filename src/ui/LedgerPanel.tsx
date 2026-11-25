import { Fragment, useState } from "react";
import { FIRST_SUPPORTED_YEAR, LAST_SUPPORTED_YEAR, isSupportedDate } from "../engine";
import type { IsoDate, LedgerRow, LedgerView, ScheduleKey } from "../engine";
import { formatEarnDate, freeSummary, typeLabel, usedNotListedMessage } from "./format";
import "./ledger.css";

interface Props {
  ledger: LedgerView;
  configured: boolean;
  /** The earliest Earn Date the picker offers. */
  hireDate: IsoDate | null;
  /** Stores an Earn Date edit against the row's schedule key. */
  onEditEarnDate: (key: ScheduleKey, date: IsoDate) => void;
  /** "Reset to projected": deletes the row's edit. */
  onResetEarnDate: (key: ScheduleKey) => void;
}

/**
 * The dates the Earn Date picker offers: from the hire date to 2100, and for
 * a Floating Holiday only within its calendar year, which it can't leave.
 */
export function earnDateRange(row: Pick<LedgerRow, "benefitType" | "earnDate">, hireDate: IsoDate | null) {
  const later = (a: IsoDate, b: IsoDate) => (a > b ? a : b);
  const first = later(hireDate ?? `${FIRST_SUPPORTED_YEAR}-01-01`, `${FIRST_SUPPORTED_YEAR}-01-01`);
  if (row.benefitType === "floatingHoliday") {
    const year = row.earnDate.slice(0, 4);
    return { min: later(first, `${year}-01-01`), max: `${year}-12-31` };
  }
  return { min: first, max: `${LAST_SUPPORTED_YEAR}-12-31` };
}

export function LedgerPanel({ ledger, configured, hireDate, onEditEarnDate, onResetEarnDate }: Props) {
  const [editingKey, setEditingKey] = useState<ScheduleKey | null>(null);

  if (!configured) {
    return <p className="empty">Enter your hire date in Settings to see your Ledger.</p>;
  }
  const usedMessage = usedNotListedMessage(ledger.usedNotListed);
  const anyEdited = ledger.groups.some((g) => g.rows.some((r) => r.edited));

  return (
    <>
      <p className="summary">{freeSummary(ledger.free)}</p>
      {usedMessage && (
        <p className="used-not-listed-message" role="status">
          {usedMessage}
        </p>
      )}
      <table className="ledger">
        <thead>
          <tr>
            <th scope="col">Earn Date</th>
            <th scope="col">Type</th>
            <th scope="col">Occasion</th>
          </tr>
        </thead>
        <tbody>
          {ledger.groups.map((group) => (
            <Fragment key={group.year}>
              <tr className="year-row">
                <th scope="rowgroup" colSpan={3}>
                  {group.year}
                </th>
              </tr>
              {group.rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty">
                    No Benefit Days
                  </td>
                </tr>
              )}
              {group.rows.map((row) => (
                <Fragment key={row.key}>
                  <LedgerRowView
                    row={row}
                    groupYear={group.year}
                    open={editingKey === row.key}
                    onToggle={() => setEditingKey(editingKey === row.key ? null : row.key)}
                  />
                  {editingKey === row.key && (
                    <tr className="earn-date-editor-row">
                      <td colSpan={3}>
                        <EarnDateEditor
                          row={row}
                          range={earnDateRange(row, hireDate)}
                          onSave={(date) => {
                            onEditEarnDate(row.key, date);
                            setEditingKey(null);
                          }}
                          onReset={() => {
                            onResetEarnDate(row.key);
                            setEditingKey(null);
                          }}
                          onCancel={() => setEditingKey(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="legend">
        <span>
          <span className="approximate-mark">*</span> approximate date
        </span>
        {anyEdited && (
          <span>
            <span className="edited-mark">•</span> Edited Earn Date
          </span>
        )}
        <span>
          <s>Struck through</s>: Lost to cap
        </span>
        <span>Tap an Earn Date to change it.</span>
      </p>
    </>
  );
}

function LedgerRowView({
  row,
  groupYear,
  open,
  onToggle,
}: {
  row: LedgerRow;
  groupYear: number;
  open: boolean;
  onToggle: () => void;
}) {
  const classes = [
    "row",
    row.benefitType === "vacation" ? "vacation" : "floating-holiday",
    row.carryover && "carryover",
    row.burnedBy && "burned",
    row.approximate && "approximate",
    row.notYetEarned && "not-yet-earned",
    row.lostToCap && "lost-to-cap",
    row.expired && "expired",
    row.edited && "edited",
    row.usedNotListed && "used-not-listed",
  ].filter(Boolean);
  const date = formatEarnDate(row.earnDate, groupYear);

  return (
    <tr className={classes.join(" ")} data-key={row.key}>
      <td className="earn-date">
        <button
          type="button"
          className="earn-date-button"
          aria-expanded={open}
          aria-label={`Change Earn Date ${date}${row.edited ? " (edited)" : ""}`}
          onClick={onToggle}
        >
          {date}
          {row.approximate && (
            <span className="approximate-mark" title="Approximate date">
              {" "}
              *
            </span>
          )}
          {row.edited && (
            <span className="edited-mark" title="Edited">
              {" "}
              •
            </span>
          )}
        </button>
      </td>
      <td>
        {typeLabel(row)}
        {row.expiresWarning && (
          <>
            {" "}
            <span className="warning">expires Dec 31</span>
          </>
        )}
      </td>
      <td className="occasion-name">
        {row.burnedBy?.occasionName ??
          (row.lostToCap ? (
            <span className="note">Lost to cap</span>
          ) : row.usedNotListed ? (
            <span className="note">Used (not listed)</span>
          ) : row.expired ? (
            <span className="note">Expired</span>
          ) : (
            ""
          ))}
      </td>
    </tr>
  );
}

function EarnDateEditor({
  row,
  range,
  onSave,
  onReset,
  onCancel,
}: {
  row: LedgerRow;
  range: { min: IsoDate; max: IsoDate };
  onSave: (date: IsoDate) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState<IsoDate>(row.earnDate);
  const allowed = isSupportedDate(date) && date >= range.min && date <= range.max;

  return (
    <form
      className="earn-date-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (allowed) onSave(date);
      }}
    >
      <label className="field">
        <span>Earn Date</span>
        <input
          type="date"
          required
          min={range.min}
          max={range.max}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <div className="actions">
        {row.edited && (
          <button type="button" onClick={onReset}>
            Reset to projected
          </button>
        )}
        <span className="spacer" />
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={!allowed || date === row.earnDate}>
          Save
        </button>
      </div>
    </form>
  );
}
