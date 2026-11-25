# Time Off Tracker: spec

Status: agreed 2026-11-24 (grilling session)
Vocabulary: [GLOSSARY.md](../../GLOSSARY.md). Decisions: [ADR 0001](../../docs/adr/0001-firebase-with-per-person-accounts.md) (Firebase, optional sign-in), [ADR 0002](../../docs/adr/0002-sap-balance-anchors-the-ledger.md) (SAP Balance anchors the Ledger).

This repo is public. Every example in this spec, the tests and the README is made up. Never commit a real person's hire date, balances or Occasion names.

## Problem

An IATSE Local 631 Regular Full Time cast member plans time off months ahead. They need to know, for any future date, how much Vacation and how many Floating Holidays they'll have. Today that means a hand-kept spreadsheet. The spreadsheet drifts because:
- SAP only takes a Day Off out of the balance after payday;
- Vacation arrives by hours worked;
- Floating Holidays expire;
- someone has to decide by hand which earned day each Day Off uses.

The tracker does that bookkeeping.

## Who it's for

- IATSE Local 631 Regular Full Time: Entertainment Technicians, Costuming and Cosmetology. Their Vacation and Floating Holiday rules are Articles 20–21 of the STCU agreement, which Addendum B-6 leaves unchanged.
- The owner on iPad, iPhone and Mac, plus any coworker who wants it. Each person's data is their own.
- The app shows this label: "IATSE Local 631 Regular Full Time (Entertainment Technicians, Costuming, Cosmetology)". It also shows a note: "Estimates only. SAP is the official record."

## Layout

- **Wide screens (about 1024px and up: iPad landscape, Mac):** three columns. Ledger on the left, Occasions in the middle, Settings on the right.
- **Narrower screens (iPhone, iPad portrait):** the same three sections as tabs: Ledger, Occasions, Settings.
- On first run, with no hire date entered yet, open on Settings.

## Settings (right)

| Field | Notes |
|---|---|
| Hire date | Drives the Accrual Tier, the first-year unlock and Floating Holiday posting. |
| Regular days off | Weekday checkboxes. Used only to default new Days Off to RDO. |
| Weekly hours | Default 40. Used to project Earn Dates. |
| SAP Vacation hours | As shown in SAP. |
| SAP Floating Holiday hours | As shown in SAP. |
| SAP Balance as-of date | Set to today whenever either balance changes. Editable. |
| Full-year history | Off by default. See "Full-year history mode". |
| Account | "Sign in with Google to sync", or "Signed in as …" with Sign out and "Delete my data". |

Every Day Off and Benefit Day is 8 hours. A balance that isn't a multiple of 8 becomes whole Benefit Days, plus a note on the Ledger such as "+4 hrs".

## Occasions (middle)

- **Columns:** Occasion, Dates, PTO Days, Season. Occasions are sorted by start date.
- **Dates:** shown like "Wed Sep 9 – Sat Sep 12". Once an Occasion has dates, a caret (▸) appears next to them.
- **Day editor:**
  - The caret opens one row per date, e.g. "Tue, Nov 24th 2026", each with a Day Type dropdown: RDO, Floating Holiday, Vacation or Unpaid.
  - **Save** stores the choices and closes the editor. **Cancel** discards them.
- **Defaults:** a new date is RDO if it falls on one of the regular days off, and Vacation otherwise. If an Occasion's range changes, dates still in the range keep their type and added dates get defaults.
- **PTO Days:** the count of Floating Holiday and Vacation Days Off. If any Days Off are Unpaid, a small "+N unpaid" note shows next to it. If the Occasion is Short, it shows "short by N" in red.
- **Season:** worked out from the start date.
  - Nov–Dec is Winter of that year.
  - Jan is Winter of the year before.
  - Feb–Apr is Spring, May–Jul is Summer, Aug–Oct is Autumn.
  - Examples: Sep 9 2026 → Autumn 2026. Nov 6 2026 → Winter 2026. Jan 15 2027 → Winter 2026. Feb 24 2027 → Spring 2027.
- **Deducted Days Off:** shown greyed as history. They Burn nothing. An Occasion whose Days Off are all Deducted is greyed as a whole.
- **Editing:** Occasions can be renamed, have their dates changed, or be deleted.
- **Clash:** a date may belong to several Occasions. If one date is Vacation or Floating Holiday in two Occasions, that's a Clash, and Save is refused with a message like "Sep 10 is already Vacation in '<other Occasion>'". This check applies to the day editor and to date-range changes. When a new Occasion's defaults would Clash, open the day editor with the clashing dates highlighted.

## Ledger (left)

One row per Benefit Day, with three columns:
- **Earn Date:** like "Mar 5". Earn Dates outside the year group show the year.
- **Type:** Vacation, "Vacation (Previous Year)" for Carryover, or Floating Holiday.
- **Occasion:** the name of the Occasion that Burns this Benefit Day. Blank if it's free.

**Groups and order:**
- Rows are grouped by calendar year: the current year, next year, and any later year an Occasion reaches.
- One separator row, showing the year, sits between groups.
- Within a group, rows are sorted by Earn Date. Carryover sits at the top of the current year.

**Summary line:** at the top, the count of free Benefit Days by type, for example "Free: 6 Vacation, 2 Floating Holidays".

**Row states, each with its own look:**
- **Lost to cap:** greyed and struck through. Can't be Burned.
- **Expired:** an unburned Floating Holiday from a past year. Hidden once that year ends.
- **Floating Holiday warning:** a current-year Floating Holiday that's still free shows "expires Dec 31".
- **Estimated:** the Earn Date was assigned by walking back (see below) or is beyond what the schedule explains.
- **Edited:** the user changed the Earn Date. Shown with a dot.
- **Used (not listed):** full-year history mode only.

**Rollover:** on Jan 1, last year's free Vacation becomes Carryover, and last year's free Floating Holidays become Expired.

### Projecting the schedule

H is the hire date and W is weekly hours.

**Accrual Tier for calendar year Y** (Art. 21 §4):

| Condition | Tier | Hours per Vacation day (step) | Days per year |
|---|---|---|---|
| Y ≥ H.year + 17 | 4 weeks | 90 | 20 |
| Y ≥ H.year + 5 | 3 weeks | 120 | 15 |
| Y ≥ H.year + 2 | 2 weeks | 180 | 10 |
| otherwise | 1 week | 360 | 5 |

Hours count toward one year up to 1,800 (Art. 21 §1).

**Vacation schedule for year Y:**
- Day k (k = 1, 2, …, while k × step ≤ 1800) has Earn Date = start + floor(k × step ÷ W × 7) days.
- start is Jan 1 of Y. In the hire year, start is H.
- Stop at the first date that falls outside Y.
- **Hire year:** the Earn Date is the later of that date and H + 9 months (Art. 21 §2). If that month is shorter than H's day of the month, use the month's last day (May 31 + 9 months → Feb 28 or 29).

**Floating Holiday schedule for year Y** (Art. 20 §3):
- If H + 1 year ≤ Jan 1 of Y: three Floating Holidays dated Jan 1.
- Otherwise: one each on Mar 1, Jun 1 and Sep 1 of Y, counting only posting dates on or after H.
- Each expires Dec 31 of Y.

**Schedule keys:** each schedule entry has a stable key, for example `vacation:2026:3`, `vacation:hire:1` or `fh:2027:2`. Earn Date edits and walk-back assignments are stored by key.

**Contract end:** the contract runs to Oct 2, 2027. Later years assume the same rules.

### Paydays and Deducted

- A Payroll Week runs Sunday to Saturday. Payday(d) is the Sunday on or before d, plus 11 days (a Thursday).
- A Day Off is Deducted when Payday(date) ≤ the SAP Balance as-of date.
- *Assumption:* a projected Vacation day is in SAP once Payday(Earn Date) ≤ as-of. A Floating Holiday is in SAP from its posting date.

### Starting from the SAP Balance (default, ADR 0002)

**Vacation:**
- n = floor(SAP Vacation hours ÷ 8).
- The candidates are every schedule entry from the hire year on that is in SAP by the as-of date, sorted newest Earn Date first.
- The first n candidates become the starting Benefit Days, marked Estimated.
- If n is more than the number of candidates, the extra rows get Earn Date = H, marked Estimated.
- Every schedule entry not yet in SAP by the as-of date becomes a projected Benefit Day.
- Schedule entries that are in SAP but weren't picked don't appear. They were used before tracking began.

**Floating Holidays:**
- The same walk-back, using m = floor(SAP Floating Holiday hours ÷ 8) and only the as-of year's Floating Holiday entries dated on or before the as-of date.
- Extra rows are dated Jan 1 of that year.
- Floating Holiday entries after the as-of date, and in later years, are projected.

### Earn Date edits

- Tapping an Earn Date opens a date picker. The edit is stored against the row's schedule key and survives any regeneration, including a hire date or weekly hours change.
- "Reset to projected" deletes the edit.
- An edit whose key no longer exists is ignored.

### Full-year history mode (setting, off by default)

**Vacation:**
- The current year's Benefit Days are rebuilt in full from the schedule.
- All of this year's Days Off take part in Burning, Deducted ones included.
- Let c = SAP days + Vacation Days Off this year with Payday ≤ as-of − this year's Vacation entries in SAP by the as-of date.
  - If c > 0: add c Carryover rows, with Earn Dates found by walking back through earlier years' entries, newest first. Use H once those run out.
  - If c < 0: before Burning, mark the |c| oldest Vacation rows that are in SAP by the as-of date as **Used (not listed)**, and tell the user.

**Floating Holidays:**
- The same calculation, using Floating Holiday Days Off.
- If c > 0, add extra rows dated Jan 1, marked Estimated.

## Burning (one pass in date order)

Every change recalculates everything from scratch. Walk dates in order. On any date, process earning before Days Off.

**When a projected Vacation day is earned:**
- Compute the SAP-terms Vacation balance just before it, in hours: leftover hours + 8 × (Vacation rows already earned and not lost − Burned Vacation Days Off with Payday ≤ this date).
- If that balance is ≥ the cap, the row is **Lost to cap**. The cap is 2 × the yearly hours of the tier in effect that year: 80, 160, 240 or 320 hours (Art. 21 §5).

**When a paid Day Off comes up:** this covers Vacation or Floating Holiday Days Off that aren't Deducted (in full-year history mode, every one this year).
- It Burns the free Benefit Day of the same Benefit Type that is earned on or before the date, not lost, and oldest by Earn Date.
- Ties: starting rows and Carryover go first, then by key.
- A Floating Holiday Day Off may only Burn a Floating Holiday from the same calendar year.
- If nothing is eligible, the Day Off goes unmet and adds 1 to its Occasion's Short count. Nothing is borrowed from the future.

RDO and Unpaid Days Off Burn nothing.

## Accounts and sync (ADR 0001)

**Hosting:** Firebase Hosting. The source is in a public GitHub repo with an MIT license.

**Signed out:** data stays in this browser's local storage.

**Signed in with Google:**
- **Storage:** one Firestore document per user at `users/{uid}`, holding settings, Occasions and Earn Date edits.
- **Access:** security rules allow read and write only when `request.auth.uid == uid`.
- **Offline:** offline persistence is on.

**First sign-in on a device with local data:**
- If the account is empty, the local data moves into it.
- If the account already has data, ask once: "Keep your account's data" or "Replace it with this device's data". Never merge.

**Sign out:** clears the device copy.

**Delete my data:** deletes the user's Firestore document and the local copy.

**iOS:** Google sign-in must work in iPhone and iPad Safari and from a home-screen icon. A web app manifest makes it installable.

## Engine shape

All the rules above go in one pure TypeScript module with no UI and no Firebase:
- **Input:** settings, Occasions, Earn Date edits and today.
- **Output:** a view model with Ledger groups and rows, each Occasion's PTO Days, unpaid count, Short count, Season and Deducted flags, plus warnings and Clash errors.

The UI only renders that view model and saves edits. Write the engine test-first against the worked examples below.

Recommended stack: React, TypeScript, Vite, Vitest and the Firebase modular SDK.

## Worked examples (made up; use as tests)

The fixture is "Sam": hired Aug 14, 2024, 40 hours a week, regular days off Saturday and Sunday. Each example starts fresh.

**E1, schedule:**
- **Vacation:**
  - Hire year: raw dates Oct 16 and Dec 18, 2024 (a third would fall in 2025, so it stops), so 2 days dated May 14, 2025.
  - 2025, 1 week: Mar 5, May 7, Jul 9, Sep 10, Nov 12.
  - 2026, 2 weeks: Feb 1, Mar 5, Apr 5, May 7, Jun 7, Jul 9, Aug 9, Sep 10, Oct 11, Nov 12.
  - 2027: the same dates as 2026.
- **Floating Holidays:** 2024: Sep 1. 2025: Mar 1, Jun 1, Sep 1. 2026: Jan 1 ×3. 2027: Jan 1 ×3.

**E2, starting balance:**
- As of Mon Nov 24, 2025: SAP Vacation 40 h and SAP Floating Holiday 8 h.
- **Vacation rows:** Nov 12 2025, Sep 10 2025, Jul 9 2025, May 14 2025, May 14 2025. No 2025 Vacation is left to project.
- **Floating Holiday row:** Sep 1, 2025, showing "expires Dec 31".
- **Projected:** all of E1's 2026 entries.

**E3, paydays:**
- A Day Off on Tue Nov 18, 2025 has Payday Thu Nov 27, 2025. With E2's as-of date, it's not Deducted, so it Burns.
- Any Day Off from Sun Sep 20 to Sat Sep 26, 2026 has Payday Thu Oct 1, 2026.

**E4, oldest first:**
- From E2, add an Occasion for Tue Feb 24 – Thu Feb 26, 2026. All three dates default to Vacation, so PTO Days is 3.
- It Burns May 14 2025, May 14 2025 and Jul 9 2025.

**E5, Floating Holidays stay in their year:**
- From E2, a Floating Holiday Day Off on Mon Jan 5, 2026 Burns a Jan 1, 2026 Floating Holiday, not the Sep 1, 2025 one.
- After rollover, the Sep 1, 2025 Floating Holiday is Expired.

**E6, Short:**
- From E2, add an Occasion for Mon Jan 5 – Fri Jan 16, 2026. That's 10 Vacation Days Off, and Jan 10–11 are RDO.
- Only E2's 5 rows are earned by then, so 5 are Burned and the Occasion is short by 5.

**E7, Vacation Cap:**
- Fixture "Lee": hired Mar 3, 2015, so 2026 is in the 3-week tier and the cap is 240 h. As of Sat Jan 10, 2026, SAP Vacation is 240 h.
- The first 2026 projected day, Jan 22, 2026, is Lost to cap.
- Add a Vacation Day Off on Mon Jan 5, 2026 (Payday Jan 15, not Deducted). That Day Off Burns a row, the balance drops to 232 h before Jan 22, and Jan 22 is earned.

**E8, full-year history mode:**
- Sam, as of Nov 24, 2025, with an Occasion for Tue Jun 10 – Wed Jun 11, 2025, both Vacation and Deducted.
- The 2025 Vacation rows are Mar 5, May 7, May 14, May 14, Jul 9, Sep 10 and Nov 12.
- With SAP 40 h: c = 5 + 2 − 7 = 0. Jun 10–11 Burn Mar 5 and May 7.
- With SAP 24 h: c = −2. Mar 5 and May 7 become Used (not listed), and Jun 10–11 Burn May 14 ×2.

**Seasons:** see the Occasions section.

## Out of scope

- Sick time and personal leave days.
- Shift lengths other than 8 hours.
- Importing a spreadsheet.
- Vacation cash-out (it shows up at the next SAP Balance update).
- Part Time and Casual Temporary rules.
- Notifications.
- Sign-in methods other than Google.

## Assumptions to check against SAP

- Newly earned Vacation shows up in SAP on the payday after its Earn Date.
- Floating Holidays show up on their posting date.
- Payday stays on Thursday even when that Thursday is a holiday (e.g. Thanksgiving, Nov 26, 2026).
- How the cap treats a balance that's partway to the cap.
- Rules after the contract ends on Oct 2, 2027.
