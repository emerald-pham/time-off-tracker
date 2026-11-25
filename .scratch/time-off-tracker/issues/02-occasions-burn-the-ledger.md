# 02: Occasions Burn the Ledger

Status: resolved
Blocked by: 01
Spec: [spec.md](../spec.md), sections Occasions, Burning, Paydays and Deducted, plus the row states in Ledger.

## Outcome

Someone adds Occasions, sets each Day Off's type in the day editor, and watches the Ledger fill up oldest-first. They can see Short Occasions, Clashes, days Lost to cap and Floating Holidays about to expire.

## Scope

- **Occasions:**
  - The table: name, dates with the caret, PTO Days with the "+N unpaid" note, and Season.
  - Add, edit and delete, sorted by start date.
- **Day editor:**
  - One row per date, formatted like "Tue, Nov 24th 2026", with the Day Type dropdown (RDO, Floating Holiday, Vacation, Unpaid). Save and Cancel.
  - Defaults come from the regular days off. Types are kept when the range changes.
- **Clash:** detect it, refuse to save, name the other Occasion, and highlight the clashing dates when a new Occasion's defaults Clash.
- **Burning, written test-first:**
  - The date-order pass: oldest eligible Benefit Day, same Benefit Type, earned on or before the date; Floating Holidays only within their own year.
  - Mark unmet Days Off as Short.
  - Deducted Days Off are history.
  - Vacation Cap with Lost to cap rows.
  - The Floating Holiday "expires Dec 31" warning, rollover and Expired.
- **Season:** worked out from the start date.

## Acceptance

- Spec examples **E3–E7** and the Season examples pass as engine tests.
- In the UI, E4's Occasion shows PTO Days 3, and its name appears on the three Burned Ledger rows.
- Saving a Clash is refused with a message naming the other Occasion.

## Comments

Resolved on branch `time-off-tracker`. E3–E7 and the Season examples are engine tests. The Clash check is in the day editor and on date-range changes. Ticket 01's rollover test expects 20 free Vacation, not 25, because the Vacation Cap applies in 2027.
