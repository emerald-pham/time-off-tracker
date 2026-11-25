import "./ledger.css";

/** Settings: full-year history mode, off by default (spec "Full-year history mode"). */
export function FullYearHistoryToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="field toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Full-year history
        <span className="hint">
          Rebuild this year's Ledger from your hire date, including days already used. The SAP Balance
          sets Carryover.
        </span>
      </span>
    </label>
  );
}
