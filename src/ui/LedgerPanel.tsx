import { useState } from "react";
import { FIRST_SUPPORTED_YEAR, LAST_SUPPORTED_YEAR, isSupportedDate } from "../engine";
import type { BenefitCounts, IsoDate, LedgerRow, LedgerView, ScheduleKey } from "../engine";
import { floatingHolidays, formatEarnDate, typeClass, typeLabel, usedNotListedMessage } from "./format";
import { AnimatedNumber, Reveal } from "./motion";
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
      <ul className="summary">
        <li className="stat-card">
          <span className="stat-title">Earned now</span>
          <FreeCounts counts={ledger.freeBy.earnedNow} />
        </li>
      </ul>
      {usedMessage && (
        <p className="used-not-listed-message" role="status">
          {usedMessage}
        </p>
      )}
      {/* A list: on a phone each row reads as two lines (US-19); on a wide panel it lines up in columns. */}
      <div className="ledger">
        <div className="ledger-head" aria-hidden="true">
          <span>Earn Date</span>
          <span>Type</span>
          <span>Occasion</span>
        </div>
        {ledger.groups.map((group) => (
          <section key={group.year} className="year-group" aria-labelledby={`year-${group.year}`}>
            <h3 className="year-row" id={`year-${group.year}`}>
              <span className="year-row-inner">
                <span className="year-label">{group.year}</span>{" "}
                <span className="year-totals">
                  <span className="totals-label">By end of {group.year}</span>
                  <FreeCounts counts={group.freeByEnd} />
                </span>
              </span>
            </h3>
            {group.rows.length === 0 ? (
              <p className="empty no-days">No Benefit Days</p>
            ) : (
              <ol className="ledger-rows">
                {group.rows.map((row, i) => (
                  <LedgerRowView
                    key={row.key}
                    row={row}
                    index={i}
                    groupYear={group.year}
                    open={editingKey === row.key}
                    onToggle={() => setEditingKey(editingKey === row.key ? null : row.key)}
                    editor={
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
                    }
                  />
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
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

/**
 * Free Vacation and Floating Holidays as two colored counts that roll when
 * they change. Reads as one line: ": 5 Vacation, 2 Floating Holidays".
 */
function FreeCounts({ counts }: { counts: BenefitCounts }) {
  return (
    <>
      <span className="sr-only">: </span>
      <span className="stat type-vacation">
        <AnimatedNumber value={counts.vacation} /> <span className="stat-unit">Vacation</span>
      </span>
      <span className="sr-only">, </span>
      <span className="stat type-floating-holiday">
        <AnimatedNumber value={counts.floatingHoliday} />{" "}
        <span className="stat-unit">{floatingHolidays(counts.floatingHoliday)}</span>
      </span>
    </>
  );
}

function LedgerRowView({
  row,
  index,
  groupYear,
  open,
  onToggle,
  editor,
}: {
  row: LedgerRow;
  index: number;
  groupYear: number;
  open: boolean;
  onToggle: () => void;
  editor: React.ReactNode;
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
  const occasion =
    row.burnedBy?.occasionName ??
    (row.lostToCap ? (
      <span className="note">Lost to cap</span>
    ) : row.usedNotListed ? (
      <span className="note">Used (not listed)</span>
    ) : row.expired ? (
      <span className="note">Expired</span>
    ) : null);

  return (
    <li className={classes.join(" ")} data-key={row.key} style={{ "--i": Math.min(index, 20) } as React.CSSProperties}>
      {/* Line 1: the date and the type, side by side. */}
      <div className="row-line">
        <span className="earn-date">
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
        </span>{" "}
        <span className={`type-label ${typeClass(row.benefitType)}`}>{typeLabel(row)}</span>
      </div>
      {/* Line 2: the Occasion that used it, or why it's gone, and any warning. */}
      {(occasion || row.expiresWarning) && (
        <div className="row-detail occasion-name">
          {occasion}
          {row.expiresWarning && (
            <>
              {occasion && " "}
              <span className="warning">expires Dec 31</span>
            </>
          )}
        </div>
      )}
      <Reveal open={open}>
        <div className="earn-date-editor-row">{editor}</div>
      </Reveal>
    </li>
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
