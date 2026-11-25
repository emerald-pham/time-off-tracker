import { Fragment } from "react";
import type { LedgerRow, LedgerView } from "../engine";
import { formatEarnDate, freeSummary, leftoverNote, typeLabel } from "./format";

export function LedgerPanel({ ledger, configured }: { ledger: LedgerView; configured: boolean }) {
  if (!configured) {
    return <p className="empty">Enter your hire date in Settings to see your Ledger.</p>;
  }
  const notes = [
    leftoverNote(ledger.leftoverHours.vacation) &&
      `Vacation ${leftoverNote(ledger.leftoverHours.vacation)}`,
    leftoverNote(ledger.leftoverHours.floatingHoliday) &&
      `Floating Holiday ${leftoverNote(ledger.leftoverHours.floatingHoliday)}`,
  ].filter(Boolean);

  return (
    <>
      <p className="summary">
        {freeSummary(ledger.free)}
        {notes.length > 0 && <span className="leftover"> ({notes.join(", ")})</span>}
      </p>
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
                <LedgerRowView key={row.key} row={row} groupYear={group.year} />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="legend">
        <span>
          <span className="estimated-mark">~</span> Estimated Earn Date
        </span>
        <span>
          <s>Struck through</s>: Lost to cap
        </span>
      </p>
    </>
  );
}

function LedgerRowView({ row, groupYear }: { row: LedgerRow; groupYear: number }) {
  const classes = [
    "row",
    row.benefitType === "vacation" ? "vacation" : "floating-holiday",
    row.carryover && "carryover",
    row.burnedBy && "burned",
    row.estimated && "estimated",
    row.lostToCap && "lost-to-cap",
    row.expired && "expired",
    row.edited && "edited",
  ].filter(Boolean);

  return (
    <tr className={classes.join(" ")} data-key={row.key}>
      <td className="earn-date">
        {formatEarnDate(row.earnDate, groupYear)}
        {row.estimated && (
          <span className="estimated-mark" title="Estimated">
            {" "}
            ~
          </span>
        )}
      </td>
      <td>
        {typeLabel(row)}
        {row.expiresWarning && <span className="warning"> expires Dec 31</span>}
      </td>
      <td className="occasion-name">
        {row.burnedBy?.occasionName ?? (row.lostToCap ? <span className="note">Lost to cap</span> : "")}
      </td>
    </tr>
  );
}
