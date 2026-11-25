# 01: Ledger from your settings

Status: ready-for-agent
Spec: [spec.md](../spec.md), sections Layout, Settings, Ledger, Projecting the schedule, Paydays and Deducted, Starting from the SAP Balance, Engine shape.

## Outcome

Someone enters a hire date, weekly hours, regular days off and their SAP Balance, and sees a correct Ledger: this year and next, separated by a year row, with the free-count summary. Everything is saved in the browser.

## Scope

- **Project setup:**
  - Run `git init`.
  - Set a repo-local author email to the owner's GitHub noreply address. Get it with `gh api user` and ask if it isn't available. Never use the owner's personal email.
  - Add an MIT `LICENSE`, and a README with the label and the "Estimates only" note.
  - Use React, TypeScript, Vite and Vitest.
- **Engine, written test-first:**
  - Accrual Tiers, the Vacation schedule including the hire-year 9-month unlock, and the Floating Holiday schedule.
  - Schedule keys and Payday.
  - The SAP walk-back, including extra rows and leftover hours.
  - Ledger grouping, ordering and the free counts.
- **UI:**
  - The responsive shell: three columns when wide, tabs when narrow. Open on Settings first.
  - The Settings panel, with the as-of date stamped automatically.
  - Read-only Ledger rendering, the label and the disclaimer.
  - Saving to local storage.

## Acceptance

- Spec examples **E1** and **E2** pass as engine tests and show correctly in the UI.
- At iPhone width the tabs work. At iPad-landscape width, three columns show.
- No real personal data anywhere in the repo.
