import { Fragment, useState } from "react";
import type { IsoDate, LedgerRow, LedgerView, ScheduleKey } from "../engine";
import { formatEarnDate, freeSummary, leftoverNote, typeLabel, usedNotListedMessage } from "./format";
import "./ledger.css";

interface Props {
  ledger: LedgerView;
  configured: boolean;
  /** Stores an Earn Date edit against the row's schedule key. */
  onEditEarnDate: (key: ScheduleKey, date: IsoDate) => void;
  /** "Reset to projected": deletes the row's edit. */
  onResetEarnDate: (key: ScheduleKey) => void;
}

export function LedgerPanel({ ledger, configured, onEditEarnDate, onResetEarnDate }: Props) {
  const [editingKey, setEditingKey] = useState<ScheduleKey | null>(null);

  if (!configured) {
    return <p className="empty">Enter your hire date in Settings to see your Ledger.</p>;
  }
  const notes = [
    leftoverNote(ledger.leftoverHours.vacation) &&
      `Vacation ${leftoverNote(ledger.leftoverHours.vacation)}`,
    leftoverNote(ledger.leftoverHours.floatingHoliday) &&
      `Floating Holiday ${leftoverNote(ledger.leftoverHours.floatingHoliday)}`,
  ].filter(Boolean);
  const usedMessage = usedNotListedMessage(ledger.usedNotListed);
  const anyEdited = ledger.groups.some((g) => g.rows.some((r) => r.edited));

  return (
    <>
      <p className="summary">
        {freeSummary(ledger.free)}
        {notes.length > 0 && <span className="leftover"> ({notes.join(", ")})</span>}
      </p>
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
          <span className="estimated-mark">~</span> Estimated Earn Date
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
    row.estimated && "estimated",
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
          {row.estimated && (
            <span className="estimated-mark" title="Estimated">
              {" "}
              ~
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
          ) : (
            ""
          ))}
      </td>
    </tr>
  );
}

function EarnDateEditor({
  row,
  onSave,
  onReset,
  onCancel,
}: {
  row: LedgerRow;
  onSave: (date: IsoDate) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState<IsoDate>(row.earnDate);

  return (
    <form
      className="earn-date-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (date) onSave(date);
      }}
    >
      <label className="field">
        <span>Earn Date</span>
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
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
        <button type="submit" className="primary" disabled={!date || date === row.earnDate}>
          Save
        </button>
      </div>
    </form>
  );
}
