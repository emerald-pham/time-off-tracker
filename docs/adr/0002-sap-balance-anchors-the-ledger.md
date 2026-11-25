# The SAP Balance anchors the Ledger

By default the Ledger starts from the SAP Balance: its N available days become N Benefit Days, with Earn Dates estimated by walking back through the projected schedule (newest first). Future Benefit Days are projected forward from the hire date at 40 hours a week. Deducted Days Off stay on screen as history but Burn nothing. We chose this over rebuilding the whole year from the hire date because SAP is the record that's actually right. A full-year rebuild drifts whenever a past Day Off isn't entered, or when overtime moves Earn Dates.

## Consequences

- The Ledger doesn't show this year's already-used Benefit Days. A "full-year history" setting, off by default, rebuilds the year from the hire date. In that mode the SAP Balance sets Carryover, and unexplained shortfalls show up as "Used (not listed)" rows.
- Earn Dates of days already in the SAP Balance are estimates. They only matter for oldest-first Burn order, so how those days were really earned (overtime, carryover) is deliberately not tracked.
