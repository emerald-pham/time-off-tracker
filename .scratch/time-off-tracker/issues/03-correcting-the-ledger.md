# 03: Correcting the Ledger

Status: ready-for-agent
Blocked by: 02
Spec: [spec.md](../spec.md), sections Earn Date edits and Full-year history mode.

## Outcome

When the projected Ledger doesn't match reality, someone can fix it: change any Earn Date, or switch on full-year history to see this year's used days rebuilt from the hire date.

## Scope

- **Earn Date edits:**
  - Tap an Earn Date to get a date picker. The edit is stored by schedule key and marked with a dot.
  - The edit survives hire date and weekly hours changes. "Reset to projected" removes it.
  - Burns recalculate right away.
- **Full-year history setting** (off by default):
  - Rebuild the current year.
  - Calculate the Carryover difference for Vacation and Floating Holidays.
  - Add Carryover rows, or mark rows "Used (not listed)" with a message telling the user.

## Acceptance

- Spec example **E8** passes as an engine test.
- Editing a row's Earn Date to a later date changes which row an Occasion Burns, and the edit is still there after changing weekly hours. Covered by a test.
