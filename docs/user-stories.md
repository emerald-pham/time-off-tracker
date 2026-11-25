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

## Planning Occasions

**US-06: Add an Occasion with a name and dates.**
Each Occasion has a name, a start date and an end date, and shows its PTO Days and Season.

**US-07: Choose each day's type.**
Once the dates are in, a caret opens one row per day, written like "Tue, Nov 24th 2026", each with a dropdown: RDO, Floating Holiday, Vacation or Unpaid. Save stores the choices and closes the list.
- New days default to RDO on my regular days off and to Vacation otherwise.

**US-08: PTO Days counts only paid time off.**
PTO Days counts Floating Holiday and Vacation days. RDO days don't count. Unpaid days show separately, as "+N unpaid".

**US-09: Overlapping Occasions are fine unless paid time clashes.**
Two Occasions may share dates, especially Unpaid or RDO days. If the same date is Vacation or Floating Holiday in both, it's a Clash, and Save is refused with a message naming the other Occasion.

**US-10: Don't let a wrong year go unnoticed.**
If a new Occasion's dates are already in the past, the app says so and offers to move them to next year. The year shows in the dates whenever it isn't the current year. Past Occasions are labelled as already taken and counted in the SAP Balance.

**US-23: Mark an Occasion approved or not.**
Each Occasion has an approval status that I can switch between "Not approved yet" and "Approved", and it's shown clearly on the Occasion. Not-approved Occasions still plan their Benefit Days, so I can see what they'd use. Occasions saved before this existed load as not approved.

**US-24: Occasions are easy to figure out.**
Instead of a small caret, each Occasion has large, clearly labelled buttons for what I can do: edit the name and dates, choose each day's type, approve or unapprove, and delete. Every field has a visible label and is obviously something I can tap.

## The Ledger

**US-11: Time off fills the Ledger oldest first.**
When I mark days as Vacation or Floating Holiday, the Ledger fills one row at a time, from the oldest earned Benefit Day to the newest. Each row's Occasion column names the Occasion that used it.

**US-12: Floating Holidays stay in their year.**
A Floating Holiday can only cover a day in the same calendar year. An unused one expires on Dec 31, and the Ledger warns me before then.

**US-13: This year and next year are separated by a row.**
The Ledger groups rows by calendar year, with one separator row between years.

**US-22: See free time off now, by the end of this year and by the end of next year.**
The Ledger summary has three lines instead of one "Free" total, each counting Vacation and Floating Holidays not used by any Occasion:
- **Earned now:** Earn Date on or before today.
- **By end of this year:** Earn Date on or before Dec 31 of this year. This year's Floating Holidays count, since they're still usable that day.
- **By end of next year:** Earn Date on or before Dec 31 of next year. This year's Floating Holidays don't count, because they've expired by then.

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

## Looks

**US-21: Three panels, as I described them.**
- On wide screens: the Ledger on the left, Occasions in the middle and Settings (hire date, SAP Balance) on the right.
- On a phone, the same three are tabs.
- The day-type dropdown offers RDO, Floating Holiday, Vacation and Unpaid, and nothing else (no sick time).

**US-19: It works on my iPhone.**
Nothing overflows its card in iPhone Safari, date fields included.

**US-20: It's pretty.**
Clear colors for each type of day, Season colors, and animations. Motion is turned off when Reduce Motion is on.
