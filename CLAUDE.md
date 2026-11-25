# Time Off Tracker

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as the `Status:` line of each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Owner guidance is acceptance tests

Every piece of guidance the owner gives (a request, a correction, a "it should do X") becomes a user story in `docs/user-stories.md` with an acceptance test whose title starts with the story ID (`US-NN: …`). Add or update the story and its test in the same change that implements the guidance. Paraphrase the guidance: this repo is public, so leave out real names, dates, balances and Occasion names.
