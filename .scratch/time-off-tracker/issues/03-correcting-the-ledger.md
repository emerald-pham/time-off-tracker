# 03: Correcting the Ledger

Status: resolved
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

## Comments

Resolved on branch `time-off-tracker`. E8 is an engine test. The code-review fix pass changed three things:
- Earn Date edits now apply before the SAP walk-back.
- Full-year history now Burns Deducted Days Off before marking rows Used (not listed). The spec is updated.
- A row edited past the shown years stays visible and can be reset.
