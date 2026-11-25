# User stories

Every piece of the owner's guidance becomes a user story here, with at least one acceptance test (see CLAUDE.md). These come from the design and build conversations. Each one has a stable ID, and its acceptance tests name the ID in the test title (for example `US-07: …`), so `npx vitest -t "US-07"` runs that story. Terms follow [GLOSSARY.md](../GLOSSARY.md). Examples use the spec's fictional cast members; this repo is public, so no real person's data goes here.

## Setting up

**US-01: Start from my hire date and SAP balance.**
As a cast member, I enter my hire date and current SAP Vacation and Floating Holiday hours, and the Ledger fills itself in.
- The Ledger shows the Benefit Days I have now, plus the ones I'll earn for the rest of this year and next year.
- How I earned the days I have now doesn't matter. Each gets an estimated Earn Date, assuming I earned it the normal way, overtime included.
- By default the Ledger shows only what's available from the SAP Balance on. Full-year history is an optional setting, off by default.

**US-02: Project earning at 40 hours a week.**
Future Vacation is projected from my hire date, as if I work 40 hours a week (the default weekly hours). The Accrual Tier goes up at my 2nd, 5th and 17th anniversaries.

**US-03: New hires get everything on their eligibility date.**
A new employee's Vacation all becomes usable at once, on the day they're first allowed to use it (hire date + 9 months). Vacation projected to be earned before that day shows that day as its Earn Date.

**US-04: Balances that aren't whole days round down.**
SAP hours that don't divide by 8 round down to a multiple of 8. The leftover hours are ignored, and Settings shows what was counted.

**US-05: SAP lags until payday.**
SAP only takes a Day Off out of my balance the week its paycheck comes out: the Thursday after its Sunday–Saturday Payroll Week. Until then, that Day Off still uses up a Benefit Day.

**US-28: Entering my current PTO totals doesn't break.**
When I type my current SAP Vacation and Floating Holiday hours into Settings, the way I really type them, the Ledger always updates correctly and nothing errors.
- After every keystroke ("4", "44", "44.5"), the "Counts as N days" note and the Ledger's free counts match what's in the field.
- Clearing a field and leaving it counts as 0. A number too big, like a pasted 99999, becomes 2,000 hours when I leave the field.
- A "," works as the decimal point too ("44,5" is 44.5), since the phone's decimal keypad shows "," in many regions.
- On a keyboard, the Up and Down arrow keys step the hours by 1, never past the field's range.
- A leading "0" is fine, and a "." left at the end keeps the number before it. A typo that isn't a number puts back what was saved, never 0.
- Signed in, my account echoing earlier keystrokes back while I'm still typing never changes what's in the field or what's saved.

## Planning Occasions

**US-06: Add an Occasion with a name and dates.**
Each Occasion has a name, a start date and an end date, and shows its PTO Days and Season.

**US-07: Choose each day's type.**
Once the dates are in, "Choose days" (see US-24) opens one row per day, written like "Tue, Nov 24th 2026", each with a dropdown: RDO, Floating Holiday, Vacation or Unpaid. Save stores the choices and closes the list.
- New days get their defaults from the weekly rule (see US-25).

**US-08: PTO Days counts only paid time off.**
PTO Days counts Floating Holiday and Vacation days. RDO days don't count. Unpaid days show separately, as "+N unpaid".
- The Occasion card shows the days broken down by type, like "4 Vacation" and "2 RDO", not a separate big total.

**US-09: Overlapping Occasions are fine unless paid time clashes.**
Two Occasions may share dates, especially Unpaid or RDO days. If the same date is Vacation or Floating Holiday in both, it's a Clash, and Save is refused with a message naming the other Occasion.

**US-10: Don't let a wrong year go unnoticed.**
If a new Occasion's dates are already in the past, the app says so and offers to move them to the first year they'd be ahead, naming that year on the button. Moving keeps the Floating Holiday and Unpaid days I chose in the same place in the dates, and the weekly rule (US-25) sets the rest. The year shows in the dates whenever it isn't the current year. Past Occasions are labelled as already taken and counted in the SAP Balance.

**US-23: Approve each day, or the whole Occasion at once.**
Each Day Off is approved or not on its own, and I can still approve or unapprove the whole Occasion in one tap. Not-approved days still plan their Benefit Days, so I can see what they'd use: approval changes nothing in the Ledger.
- In "Choose days", each day has a large Approved / Not approved switch next to its Day Type.
- The card has "Approve all" and "Unapprove all" buttons, and a badge that sums it up: "Approved" (every day), "Not approved yet" (none) or "Partly approved · 3 of 5 days".
- While that Occasion's "Choose days" is open, its switches decide approval, so "Approve all" and "Unapprove all" step aside. Saving "Choose days" only changes the days I switched there: any other day keeps the approval it has when I save, even if it changed meanwhile (on another device, say).
- When I change the dates, days still in range keep their approval and added days start unapproved. "Move to <year>" (US-10) keeps each day's approval in the same place in the dates.
- An Occasion that's already taken (labelled "Already taken", see US-10) shows no approval badge, buttons or switches, since "Already taken" says it all. Deducted days have no switch either.
- Saved data keeps its meaning (US-18): Occasions saved before approval existed load as not approved, and ones saved as approved have every day approved.

**US-24: Occasions are easy to figure out.**
Instead of a small caret, each Occasion has large, clearly labelled buttons for what I can do: edit the name and dates, choose each day's type, approve or unapprove, and delete. Every field has a visible label and is obviously something I can tap.

**US-25: Fill in Day Types automatically, week by week.**
Every week (Sunday to Saturday) has two days off, so the app works out each day's type from where my time off crosses a week break. PTO hugs the Saturday/Sunday break, and the RDOs sit on the far side of it.
- A *segment* is the Occasion's dates in one week. A segment of n days has min(2, n) RDOs, and the rest are Vacation.
- A week has two days off in total, shared by every Occasion in it: an Occasion only gets the RDOs the week's other Occasions haven't already taken (max(0, 2 − taken)). Mon–Tue in one Occasion and Thu–Fri in another, same week: the second is Vacation, Vacation. This applies to new Occasions, changed dates and "Fill in automatically".
- Within one week, or running on into the next week only: RDOs first, Vacation at the end. Wed–Sat gives RDO, RDO, Vacation, Vacation: 2 PTO Days.
- Carrying on from the previous week only: Vacation first, then the RDOs.
- A full Sunday–Saturday week in the middle: Vacation at both ends and the 2 RDOs in the middle, with ceil((n − 2) / 2) Vacation days before them: Vac, Vac, Vac, RDO, RDO, Vac, Vac.
- Examples: Wed–Tue across one weekend gives RDO, RDO, Vac, Vac, Vac, RDO, RDO (3 PTO Days). Fri–Sun gives 0 PTO Days.
- New Occasions, and dates moved to a later year (keeping their Floating Holiday and Unpaid days, US-10), get these types.
- When I change an Occasion's dates: if I never changed its types, the whole new range is worked out again. Otherwise the dates still in range keep my types, and added dates get the type the rule gives them over the new range, never giving a week more than its two days off: my kept choices win, and an added date that would be an extra RDO is Vacation.
- The day editor has a large "Fill in automatically" button that applies the rule to the list, leaving Deducted days as they are; Save keeps it and Cancel throws it away.
- Clash rules don't change. Settings no longer asks for my regular days off; what was saved there is kept, so older data still loads.

**US-26: Nudge me to use Floating Holidays before Vacation.**
Floating Holidays expire on Dec 31 and Vacation carries over, so when free Floating Holidays could cover some of an Occasion's Vacation days, its card shows a gentle note, like "2 Floating Holidays could cover days here instead of Vacation. They expire Dec 31."
- Free means not used by any Occasion, not Expired, from the same calendar year as the day, and earned on or before it. Deducted days aren't counted.
- Occasions share the free Floating Holidays, earliest Occasion first, so the notes never add up to more than there are.
- A large "Use Floating Holidays" button switches that many of the Occasion's Vacation days, earliest first, to Floating Holiday and saves, with the usual Clash check. Then the note goes away.
- It's only a nudge: nothing is blocked, and the days that aren't RDOs still default to Vacation (US-25).

**US-29: Red-flag a week with more than two RDOs.**
A week (Sunday to Saturday) only has two days off, so when Occasions overlap the same week, or I set the types by hand, the app flags any week with more than two RDOs.
- RDOs count by date: a date that's RDO in two overlapping Occasions is one day off, so it counts once.
- A date that's RDO in one Occasion but Vacation or Floating Holiday in an overlapping one is a paid day off, so it doesn't count as an RDO.
- Each Occasion in that week shows a red warning, like "Too many RDOs: the week of Sun Mar 7 has 3 RDOs across 'A' and 'B'. A week only has 2."
- In "Choose days" the same warning shows live as I change the types, and the extra RDO rows are highlighted red.
- It's a warning, not a block: Save still works.
- A week whose RDOs are all Deducted (already taken) isn't flagged, since there's nothing left to change.
- Filling in Day Types automatically (US-25) shares each week's two days off, so it never causes this.

**US-27: Fill in the end date for me.**
Once I enter a start date, in "Plan an Occasion" or in "Edit the name and dates", the end date fills itself in as the day after.
- An empty end date becomes the start + 1 day.
- An end date earlier than the new start also becomes the start + 1 day.
- An end date I chose that's on or after the start is never overwritten.
- It waits for a real date, so the years a date field passes through while I type don't fill anything in.

## The Ledger

**US-11: Time off fills the Ledger oldest first.**
When I mark days as Vacation or Floating Holiday, the Ledger fills one row at a time, from the oldest earned Benefit Day to the newest. Each row's Occasion column names the Occasion that used it.

**US-12: Floating Holidays stay in their year.**
A Floating Holiday can only cover a day in the same calendar year. An unused one expires on Dec 31, and the Ledger warns me before then.

**US-13: This year and next year are separated by a row.**
The Ledger groups rows by calendar year, with one separator row between years.

**US-22: See free time off now, by the end of this year and by the end of next year.**
Instead of one "Free" total, the Ledger counts Vacation and Floating Holidays not used by any Occasion three ways, and each year's estimate sits with that year's label:
- **Earned now:** Earn Date on or before today. This is the card at the top of the Ledger.
- **By end of this year:** Earn Date on or before Dec 31 of this year, shown on this year's separator row. This year's Floating Holidays count, since they're still usable that day.
- **By end of next year:** Earn Date on or before Dec 31 of next year, shown on next year's separator row. This year's Floating Holidays don't count, because they've expired by then.
- Any later year the Ledger shows (because an Occasion reaches it) gets its own "By end of" totals on its row the same way.

**US-14: Change an Earn Date by tapping it.**
Tapping a date on the Ledger lets me change the day that Benefit Day was earned. The change stays put, and I can reset it.

**US-15: See what's earned and what isn't.**
- An Earn Date that hasn't arrived yet shows in italics, with the type "Vacation (Estimated)" or "Floating Holiday (Estimated)".
- An Earn Date on or before today is upright, with the type "Vacation (Earned)" or "Floating Holiday (Earned)".
- A past Earn Date that's only an approximation is marked with an asterisk ("*").
- Carryover keeps the label "Vacation (Previous Year)".

## Accounts and devices

**US-16: Sign-in is optional and syncs.**
I can use the app without signing in. Signing in with Google syncs my data across my iPhone, iPad and Mac.

**US-17: Coworkers can use it too, privately.**
Coworkers (IATSE Local 631 Regular Full Time) can sign in with their own accounts. Each person sees only their own data.

**US-18: Saved data keeps working.**
Every update is backwards compatible. Data saved by an earlier version, on the device or in the account (including Earn Date edits, which stay attached to the same rows), still loads.
- A day an older save left without a Day Type keeps its old default while regular days off are saved: RDO on those weekdays, Vacation otherwise. Without them it follows the weekly rule (US-25). New Occasions always store their types.

## Looks

**US-21: Three panels, as I described them.**
- On wide screens: the Ledger on the left, Occasions in the middle and Settings (hire date, SAP Balance) on the right.
- On a phone, the same three are tabs.
- The day-type dropdown offers RDO, Floating Holiday, Vacation and Unpaid, and nothing else (no sick time).

**US-19: It works and reads well on my iPhone.**
Nothing overflows its card in iPhone Safari, date fields included. On a phone the Ledger reads as a clean list:
- Each row's date and type label ("Vacation (Earned)") fit on one line.
- The Occasion name sits on its own line beneath, not squeezed into a narrow column.
- Nothing scrolls sideways.

**US-20: It's pretty.**
Clear colors for each type of day, Season colors, and animations. Motion is turned off when Reduce Motion is on.
- A vivid palette in light and dark, with one color per Day Type (Vacation, Floating Holiday, RDO, Unpaid) used the same way on the Ledger, the day editor and the PTO counts, and one per Season.
- A friendly header and a colorful "Earned now" card; the year rows, Estimated italics and the "*" stay easy to spot.
- Editors open and close smoothly, rows and cards fade in, tabs slide, buttons press and counts roll to their new value.
- System fonts only, and nothing loaded from other sites.
- A softly animated, out-of-focus bokeh background drifts behind everything, in the app's sunset colors.
- Every gradient in the app (the header, tabs, buttons, cards, panel bars, year rows and year labels) gently drifts too, like soft-focus bokeh: slow loops of different lengths, with soft orbs floating behind the header's text. Only the dropdown arrows hold still. At rest, and under Reduce Motion, everything looks as it did before.
- Text stays readable (WCAG AA 4.5:1) on the surface it sits on.
