# Time Off Tracker: spec

Status: agreed 2026-11-24 (grilling session)
Vocabulary: [GLOSSARY.md](../../GLOSSARY.md). Decisions: [ADR 0001](../../docs/adr/0001-firebase-with-per-person-accounts.md) (Firebase, optional sign-in), [ADR 0002](../../docs/adr/0002-sap-balance-anchors-the-ledger.md) (SAP Balance anchors the Ledger), [ADR 0003](../../docs/adr/0003-account-document-merges-edits-by-entry.md) (the account document merges edits entry by entry).

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
- **Look (US-19, US-20):** color tokens on `:root` for light and dark, with one color per Day Type and per Season, used the same way everywhere. System fonts only, nothing loaded from other sites. Panels, rows and cards animate in, editors slide open and closed, buttons press and counts roll; under Reduce Motion (`prefers-reduced-motion: reduce`) every animation and transition is off. Nothing overflows its card at 375 px, and fields use 16 px text so iOS Safari doesn't zoom.

## Settings (right)

| Field | Notes |
|---|---|
| Hire date | Drives the Accrual Tier, the Vacation eligibility date and Floating Holiday posting. |
| Weekly hours | Default 40. Used to project Earn Dates. From 1 to 80. |
| SAP Vacation hours | As shown in SAP. From 0 to 2,000. |
| SAP Floating Holiday hours | As shown in SAP. From 0 to 2,000. |
| SAP Balance as-of date | Set to today when the hire date is first entered, and whenever either balance changes. Editable, but it can't be cleared: the Ledger always works from a real date, never "today", so it doesn't drift as days pass. A save from before this rule with a hire date and no as-of date gets today's date once, when it loads. |
| Full-year history | Off by default. See "Full-year history mode". |
| Account | "Sign in with Google to sync", or "Signed in as …" with Sign out and "Delete my data". |

Every Day Off and Benefit Day is 8 hours. An SAP Vacation or Floating Holiday balance that isn't a multiple of 8 rounds down to whole Benefit Days everywhere: the Ledger rows, the Vacation Cap check and full-year history. The hours left over are ignored. Under each SAP hours field, a short muted helper says what the app counts, such as "Counts as 5 days" or "Counts as 5 days (3 hrs left over, less than a day)", with the hours rounded to 2 decimals ("5.6 hrs").

**Input limits:** a number left out of range is clamped when the field is left. A balance left blank becomes 0; weekly hours left blank go back to the saved value. Every date the app saves (hire date, as-of date, Occasion dates, Earn Date edits) must be a real date from 1950 to 2100, so a year still being typed (0002, 0020, 0202) is never saved. Saved data is checked the same way when it loads, so a damaged or hand-edited save can't break the Ledger.

**Today** is the device's local date. It moves on at midnight while the app stays open, and catches up when the app comes back into view.

## Occasions (middle)

- **Cards (US-24):** one card per Occasion, sorted by start date. Each shows its name, its approval badge, and labelled Dates, PTO Days and Season, plus a strip with one colored bar per Day Off. Below them are four large labelled buttons (at least 44 px tall): **Edit** (name and dates), **Choose days** (the day editor), **Approve** or **Unapprove**, and **Delete**. Delete asks on the card ("Delete '<name>'? This can't be undone." with "Keep it" and "Yes, delete"), never in a browser dialog. Every field has a visible label.
- **Dates:** shown like "Wed Sep 9 – Sat Sep 12". A date outside the current year shows its year: "Mon Mar 1 – Tue Mar 2, 2027", once when both dates share it.
- **Approval (US-23):** each Occasion is "Not approved yet" or "Approved", shown as a badge and switched with Approve / Unapprove. It's stored as `approved: true` on the Occasion, and left out when not approved, so every Occasion saved before this loads as not approved and older saves keep their shape. Approval changes nothing else: a not-approved Occasion still Burns, so the Ledger shows what it would use.
- **Wrong-year safeguards (US-10):**
  - When a new Occasion is saved with dates already in the past (all Deducted, or ending before today), its card asks "These dates are in the past. Did you mean <year>?" with **Move to <year>** and **Keep these dates**. The year is the first one in which the Occasion ends on or after today. Moving shifts both dates forward that many years (Feb 29 becomes Feb 28 in a year without one); Floating Holiday and Unpaid days keep their place in the range (by day index from the start), and the weekly rule sets RDO and Vacation for the rest. If the moved dates Clash, the day editor opens with them highlighted.
  - An Occasion whose Days Off are all Deducted is labelled "Already taken · counted in your SAP balance".
- **Day editor:**
  - **Choose days** opens one row per date, e.g. "Tue, Nov 24th 2026", each with a Day Type dropdown: RDO, Floating Holiday, Vacation or Unpaid, colored by its Day Type.
  - A large **Fill in automatically** button above the list applies the weekly rule (below) to every day that isn't Deducted; Deducted days keep their type, since SAP already shows them. It only changes the draft: **Save** keeps it, **Cancel** throws it away.
  - **Save** stores the choices and closes the editor. **Cancel** discards them.
- **Defaults: the weekly rule (US-25).** Weeks run Sunday to Saturday, and a *segment* is the Occasion's dates in one week. A segment of n days has r = min(2, n) RDOs and n − r Vacation days. PTO hugs the Saturday/Sunday break the time off crosses, and the RDOs sit on the far side of it:
  - The Occasion lies within one week, or the segment runs on into the next week only (its last day is a Saturday and the Occasion goes on): RDOs first, Vacation at the end. Wed–Sat: RDO, RDO, Vac, Vac.
  - The segment carries on from the previous week only (its first day is a Sunday and the Occasion started earlier): Vacation first, then the RDOs.
  - Both (a full Sunday–Saturday week in the middle): ceil((n − 2) / 2) Vacation, the 2 RDOs, then Vacation: Vac, Vac, Vac, RDO, RDO, Vac, Vac.
  - A week has two days off in total, shared by every Occasion in it. When the rule fills a new Occasion, a changed range or "Fill in automatically", it counts the RDO dates other Occasions already hold in that week (stored or worked out) and gives the segment only r = min(n, max(0, 2 − held)); with r < 2 a full middle week leads with ceil((n − r) / 2) Vacation. Mon–Tue in one Occasion and Thu–Fri in another, same week: the second is Vacation, Vacation. The engine works out missing types in start-date order.
  - Examples: Wed Feb 24 – Tue Mar 2, 2027 is RDO, RDO, Vac, Vac, Vac, RDO, RDO (3 PTO Days). Fri Nov 6 – Sun Nov 8, 2026 is all RDO (0 PTO Days). A one-day Occasion is an RDO.
  - New Occasions and dates moved to next year get these types, stored outright. A date with no stored type gets them too, except in older saves (US-18): while the stored `regularDaysOff` is non-empty, a missing type is RDO on those weekdays and Vacation otherwise, as before the weekly rule. The engine works them out (`weeklyDayTypes`).
  - **Range changes:** if the Occasion's types are what the rule gives its old range (never customized), the whole new range gets the rule's types. Otherwise dates still in range keep their type, and added dates get the type the rule gives them over the new range. After merging, no week has more than two RDOs (counting other Occasions' too): the kept choices win, and a rule-assigned RDO on an added date beyond that becomes Vacation, earliest dates keeping theirs.
  - The stored `regularDaysOff` setting is no longer shown, but it's kept so older saves load unchanged, and it still sets the default for dates those saves left without a type.
- **Floating Holiday nudge (US-26):** when free Floating Holidays could cover some of an Occasion's Vacation Days Off, its card shows a gentle, non-blocking note: "2 Floating Holidays could cover days here instead of Vacation. They expire Dec 31." (singular: "1 Floating Holiday could cover a day here … It expires Dec 31."). Free means not used by any Occasion after the full Burn pass and not Expired; a Floating Holiday can cover a Vacation Day Off that isn't Deducted, in its own calendar year, on or after its Earn Date. The engine lists the days per Occasion (`floatingHolidaysCouldCover`), matching days earliest first. The Occasions share one pool of free Floating Holidays, taken in start-date order, so the suggestions never add up to more than the free Floating Holidays. A large **Use Floating Holidays** button switches those days to Floating Holiday and saves through the usual Clash check; if that's refused, the day editor opens with the clashing dates highlighted. Afterwards the note goes away. Day Types still default to Vacation; this is only a nudge.
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
- **Earn Date:** like "Mar 5". Earn Dates outside the year group show the year. An Estimated Earn Date (later than today) is in italics; an Earned one (on or before today) is upright.
- **Type:** the Benefit Type and whether it's earned yet: "Vacation (Earned)", "Vacation (Estimated)", "Floating Holiday (Earned)" or "Floating Holiday (Estimated)". Carryover is "Vacation (Previous Year)", since it's earned by definition.
- **Occasion:** the name of the Occasion that Burns this Benefit Day. Blank if it's free.

**Groups and order:**
- Rows are grouped by calendar year: the current year, next year, and any later year an Occasion or an edited Earn Date reaches. Every row with an Earn Date edit is shown somewhere, so "Reset to projected" is always reachable, and the summary only counts rows that are shown.
- One separator row, showing the year and that year's "By end of" totals, sits between groups.
- Within a group, rows are sorted by Earn Date. Carryover sits at the top of the current year.

**Free time off (US-22):** free Benefit Days (not used by any Occasion, not Lost to cap, Expired or Used (not listed)) counted by type:
- "Earned now: 5 Vacation, 2 Floating Holidays": Earn Date on or before today. The card at the top of the Ledger.
- "By end of 2026: …": on each year's separator row, next to the year, the Benefit Days usable on Dec 31 of that year: Earn Date on or before that day, and for Floating Holidays only that year's, since earlier ones have expired. So the current year's row counts this year's Floating Holidays, next year's row counts only next year's, and any later year shown gets its own totals the same way. The engine works these out per year group (`freeByEnd`).

**Row states, each with its own look:**
- **Lost to cap:** greyed and struck through. Can't be Burned.
- **Expired:** an unburned Floating Holiday from a past year. Hidden once that year ends, unless its Earn Date was edited, so the edit can still be reset.
- **Floating Holiday warning:** a current-year Floating Holiday that's still free shows "expires Dec 31".
- **Earned / Estimated:** a row is Earned when its Earn Date is on or before today, and Estimated (not yet earned) when it's later. Estimated dates are in italics; Earned dates never are.
- **Approximate:** the Earn Date was assigned by walking back (see below) or is beyond what the schedule explains. Shown with "*" after the date, and a legend line: "* approximate date".
- **Edited:** the user changed the Earn Date. Shown with a dot.
- **Used (not listed):** SAP shows the day used and no listed Day Off explains it. Full-year history mode marks these (see below). An edited row moved among the days SAP already shows used is marked too.

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
- Day k (k = 1, 2, …, while k × step ≤ 1800) is credited on start + floor(k × step ÷ W × 7) days.
- start is Jan 1 of Y. In the hire year, start is H.
- Stop at the first credited date that falls outside Y.
- **Eligibility date:** H + 9 months (Art. 21 §2). If that month is shorter than H's day of the month, use the month's last day (May 31 + 9 months → Feb 28 or 29).
- **Earn Date:** the later of the credited date and the eligibility date. So all the Vacation a new employee earns before the eligibility date becomes usable at once, on that date, whichever calendar year it was credited in.
- The credited date decides whether a day is already in the SAP Balance (the walk-back and the Payday split below). The Earn Date is what the Ledger shows and what Burning uses.
- *Example (made-up hire date Oct 11, 2025, 40 h a week):* the eligibility date is Jul 11, 2026. The hire-year day credited Dec 13, 2025 and the 2026 days credited Mar 5, May 7 and Jul 9 all have Earn Date Jul 11, 2026. Sep 10 and Nov 12 keep their own dates.

**Floating Holiday schedule for year Y** (Art. 20 §3):
- If H + 1 year ≤ Jan 1 of Y: three Floating Holidays dated Jan 1.
- Otherwise: one each on Mar 1, Jun 1 and Sep 1 of Y, counting only posting dates on or after H.
- Each expires Dec 31 of Y.

**Schedule keys:** each schedule entry has a stable key, for example `vacation:2026:3`, `vacation:hire:1` or `fh:2027:2`. Earn Date edits and walk-back assignments are stored by key.

**Contract end:** the contract runs to Oct 2, 2027. Later years assume the same rules.

### Paydays and Deducted

- A Payroll Week runs Sunday to Saturday. Payday(d) is the Sunday on or before d, plus 11 days (a Thursday).
- A Day Off is Deducted when Payday(date) ≤ the SAP Balance as-of date.
- *Assumption:* a projected Vacation day is in SAP once Payday(credited date) ≤ as-of, even if its Earn Date (the eligibility date) is later. A Floating Holiday is in SAP from its posting date.

### Starting from the SAP Balance (default, ADR 0002)

**Vacation:**
- n = floor(SAP Vacation hours ÷ 8).
- The candidates are every schedule entry from the hire year on that is in SAP by the as-of date, sorted newest credited date first, except that entries with an Earn Date edit come before the rest.
- The first n candidates become the starting Benefit Days, marked Approximate. Each keeps its Earn Date, so a day credited before the eligibility date can't be Burned before it.
- If n is more than the number of candidates, the extra rows get Earn Date = the eligibility date, marked Approximate.
- Every schedule entry not yet in SAP by the as-of date becomes a projected Benefit Day.
- Schedule entries that are in SAP but weren't picked don't appear. They were used before tracking began.

**Floating Holidays:**
- The same walk-back, using m = floor(SAP Floating Holiday hours ÷ 8) and only the as-of year's Floating Holiday entries dated on or before the as-of date.
- Extra rows are dated Jan 1 of that year.
- Floating Holiday entries after the as-of date, and in later years, are projected.

### Earn Date edits

- Tapping an Earn Date opens a date picker. The edit is stored against the row's schedule key and survives any regeneration, including a hire date or weekly hours change.
- Edits move schedule entries before anything else looks at their dates, so the walk-back and the in-SAP split use the edited Earn Date. An edit is a manual override: it sets the credited date and the Earn Date alike, and isn't held back to the eligibility date. An entry moved before the as-of date (by Payday) counts as one of SAP's days, not an extra one. An entry moved past it is projected.
- In the walk-back, edited entries come before approximate ones, so moving a day that's in SAP to an older date keeps it in SAP. An edited entry that's still left out (more edited days in SAP than SAP has, or a Floating Holiday moved into an earlier year) is listed as Used (not listed).
- The picker allows dates from the hire date to 2100. A Floating Holiday's picker stays within its calendar year.
- "Reset to projected" deletes the edit.
- An edit whose key no longer exists is ignored.

### Full-year history mode (setting, off by default)

**Vacation:**
- The current year's Benefit Days are rebuilt in full from the schedule.
- All of this year's Days Off take part in Burning, Deducted ones included.
- Let c = SAP days + Vacation Days Off this year with Payday ≤ as-of − this year's Vacation entries in SAP by the as-of date.
  - If c > 0: add c Carryover rows, with Earn Dates found by walking back through earlier years' entries, newest credited first. Use the eligibility date once those run out.
  - If c < 0: SAP shows |c| days used that no listed Day Off explains. This year's Deducted Days Off Burn first, oldest row first as usual. Then, before any Day Off that isn't Deducted, the |c| oldest Vacation rows in SAP by the as-of date that are still free become **Used (not listed)**, and the user is told. Used (not listed) rows Burn nothing and don't count toward the Vacation Cap. (Paydays only move forward, so every Deducted Day Off comes before the first one that isn't.)

**Floating Holidays:**
- The same calculation, using Floating Holiday Days Off.
- If c > 0, add extra rows dated Jan 1, marked Approximate.

## Burning (one pass in date order)

Every change recalculates everything from scratch. Walk dates in order. On any date, process earning before Days Off.

**When a projected Vacation day is earned:**
- Compute the SAP-terms Vacation balance just before it, in hours: 8 × (Vacation rows already earned and not lost − Burned Vacation Days Off with Payday ≤ this date).
- If that balance is ≥ the cap, the row is **Lost to cap**. The cap is 2 × the yearly hours of the tier in effect that year: 80, 160, 240 or 320 hours (Art. 21 §5).

**When a paid Day Off comes up:** this covers Vacation or Floating Holiday Days Off that aren't Deducted (in full-year history mode, every one this year).
- It Burns the free Benefit Day of the same Benefit Type that is earned on or before the date, not lost, and oldest by Earn Date.
- Ties: starting rows and Carryover go first, then by key.
- A Floating Holiday Day Off may only Burn a Floating Holiday from the same calendar year.
- If nothing is eligible, the Day Off goes unmet and adds 1 to its Occasion's Short count. Nothing is borrowed from the future.

RDO and Unpaid Days Off Burn nothing.

## Accounts and sync (ADR 0001, ADR 0003)

**Hosting:** Firebase Hosting. The source is in a public GitHub repo with an MIT license. Every path is served `no-cache` except the hashed files in `/assets/`, which are cached for a year; a missing `/assets/` file is a 404, never the page.

**Signed out:** data stays in this browser's local storage.
- Safari deletes a site's storage after 7 days without a visit, unless the app is on the Home Screen. The app asks the browser to keep its storage, and the Account section says so: sign in, or add the app to the Home Screen.
- If the browser refuses storage altogether, the app keeps working in memory and says changes last only until the page closes.

**Signed in with Google:**
- **Storage:** one Firestore document per user at `users/{uid}`, holding settings, Occasions (keyed by id) and Earn Date edits, each its own field. Its `version` is 2 (ADR 0003).
- **Access:** security rules allow read and write only when `request.auth.uid == uid`. The rules also whitelist the fields, check each part's shape, create only version 2, and never let the version go down.
- **Offline:** offline persistence is on. A save lands on the device at once and syncs when online; nothing waits on the server except sign-out and "Delete my data".

**Sync between devices and tabs:**
- The app follows the stored data live, so an edit on one device or tab shows up on the others as it syncs. Nothing is re-read on a timer or on returning to the app.
- Each edit writes only the entries it changed: one setting, one Occasion (always whole) or one Earn Date edit. Edits to different entries on different devices all survive, online or offline. Edits to the same entry end with whichever reached the account last. No edit writes the whole document, so a device with a stale copy can't overwrite what others changed, or bring back data deleted elsewhere. Signed out, two tabs follow the same rule through local storage.
- A version 1 document (Occasions as a list) loads as before and keeps its list. Occasions saved from now on are stored by id beside it, overriding it.
- Data saved by a newer version of the app is never overwritten: the app says to reload to update it.
- A tab reloads when its account signs out or changes in another tab, when another tab says it's signing out, or when its connection to the offline copy has been shut down, so it never sits there unable to save.

**First sign-in on a device with local data:**
- If the account is empty, or holds only the defaults, the local data moves into it without asking.
- If the account already has data, ask once: "Keep your account's data" or "Replace it with this device's data". Never merge.
- The question belongs to the account it was asked for: if the account changes meanwhile, it's dropped, and so is any handoff that finishes late. Every open tab may ask; once one tab has finished, a later answer in another tab leaves the account alone.
- If the account's data can't be loaded (say, offline on a new device), the person stays signed in and sees the error with "Try again" and "Sign out". This device's data is left alone.

**Sign out:** clears the device copy. It first waits a few seconds for every change to reach the account. If some haven't (offline), sign-out is refused with an explanation, and "Discard unsynced changes and sign out" signs out anyway.

**Delete my data:** deletes the user's Firestore document and the local copy, then signs out.
- Signed in, it needs a connection. The app checks it can reach the account, then deletes the document on the server in one step that never waits in the offline queue, so a delete can't run later over data other devices have saved since. Offline, it refuses with "You need to be online to delete your data", and nothing is deleted.
- While the delete runs, and after it, no edit on this device is saved, so nothing can bring the document back.

**Startup:** the app shows at once, on this device's copy, and loads Firebase behind it. Unless the last visit is known to have ended signed out, it says "Loading your account…" until Firebase answers instead (if Firebase can't load, it carries on signed out, unless the person was signed in). Errors never leave a blank page: loading, saving and Ledger errors are shown with Settings and the Account section still reachable.

**iOS:** Google sign-in must work in iPhone and iPad Safari and from a home-screen icon. A web app manifest makes it installable.

## Engine shape

All the rules above go in one pure TypeScript module with no UI and no Firebase:
- **Input:** settings, Occasions, Earn Date edits and today.
- **Output:** a view model with Ledger groups and rows, each Occasion's PTO Days, unpaid count, Short count, Season, Deducted flags and the Vacation days free Floating Holidays could cover, plus warnings and Clash errors.

The UI only renders that view model and saves edits. Write the engine test-first against the worked examples below.

Recommended stack: React, TypeScript, Vite, Vitest and the Firebase modular SDK.

## Worked examples (made up; use as tests)

The fixture is "Sam": hired Aug 14, 2024, 40 hours a week. Each example starts fresh. Unless an example says otherwise, its Occasions have Vacation chosen Monday to Friday and RDO on Saturday and Sunday (the tests' `vacationOnWeekdays`), not the weekly rule's defaults.

**E1, schedule:**
- **Vacation:** the eligibility date is May 14, 2025.
  - Hire year: credited Oct 16 and Dec 18, 2024 (a third would fall in 2025, so it stops), so 2 days dated May 14, 2025.
  - 2025, 1 week: credited Mar 5, May 7, Jul 9, Sep 10, Nov 12. Mar 5 and May 7 fall before the eligibility date, so the Earn Dates are May 14, May 14, Jul 9, Sep 10, Nov 12.
  - 2026, 2 weeks: Feb 1, Mar 5, Apr 5, May 7, Jun 7, Jul 9, Aug 9, Sep 10, Oct 11, Nov 12.
  - 2027: the same dates as 2026.
- **Floating Holidays:** 2024: Sep 1. 2025: Mar 1, Jun 1, Sep 1. 2026: Jan 1 ×3. 2027: Jan 1 ×3.

**E2, starting balance:**
- As of Mon Nov 24, 2025: SAP Vacation 40 h and SAP Floating Holiday 8 h.
- **Vacation rows:** walking back by credited date picks Nov 12, Sep 10, Jul 9, May 7 and Mar 5, 2025, shown as Nov 12 2025, Sep 10 2025, Jul 9 2025, May 14 2025, May 14 2025. No 2025 Vacation is left to project.
- **Floating Holiday row:** Sep 1, 2025, showing "expires Dec 31".
- **Projected:** all of E1's 2026 entries.

**E3, paydays:**
- A Day Off on Tue Nov 18, 2025 has Payday Thu Nov 27, 2025. With E2's as-of date, it's not Deducted, so it Burns.
- Any Day Off from Sun Sep 20 to Sat Sep 26, 2026 has Payday Thu Oct 1, 2026.

**E4, oldest first:**
- From E2, add an Occasion for Tue Feb 24 – Thu Feb 26, 2026. All three dates are Vacation, so PTO Days is 3.
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
- The 2025 Vacation rows are May 14 ×4, Jul 9, Sep 10 and Nov 12.
- With SAP 40 h: c = 5 + 2 − 7 = 0. Jun 10–11 Burn two of the May 14 rows.
- With SAP 24 h: c = −2. Jun 10–11 Burn two May 14 rows first, then the other two May 14 rows become Used (not listed).
- With SAP 8 h and one Deducted Day Off on Mon Jun 2, 2025 instead: c = 1 + 1 − 7 = −5. Jun 2 Burns a May 14 row (only the May 14 rows are earned by then), then the five oldest still free (three May 14, Jul 9, Sep 10) become Used (not listed). Nothing is Short.

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
