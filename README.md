# Time Off Tracker

**IATSE Local 631 Regular Full Time (Entertainment Technicians, Costuming, Cosmetology)**

> Estimates only. SAP is the official record.

Plans time off against the Vacation and Floating Holidays a Regular Full Time
cast member earns under Articles 20 and 21 of the STCU agreement (unchanged by
Addendum B-6). Enter your hire date, weekly hours, regular days off and SAP
Balance, and the Ledger shows every Benefit Day you have and will earn, this
year and next.

Vocabulary is in [GLOSSARY.md](GLOSSARY.md); decisions are in [docs/adr/](docs/adr/).

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # engine tests (Vitest)
npm run build   # type-check and production build
```

The rules live in a pure module, `src/engine/`, with no UI or storage code.
Persistence sits behind the `DataStore` interface in `src/storage/`.

## Accounts and sync

Signing in is optional ([ADR 0001](docs/adr/0001-firebase-with-per-person-accounts.md)).
Signed out, data stays in this browser's local storage. Signed in with Google,
it lives in one Firestore document per person, `users/{uid}`, which
[`firestore.rules`](firestore.rules) opens only to that person.

The Firebase web config comes from `VITE_FIREBASE_*` env vars (see
[`.env.example`](.env.example)). Without them the app runs signed-out only and
hides the sign-in button.

`VITE_FIREBASE_AUTH_DOMAIN` must be the domain that serves the app (for
example `<project-id>.web.app`), and `https://<that domain>/__/auth/handler`
must be an authorized redirect URI on the Google OAuth client. Safari
partitions third-party storage, so redirect sign-in (which iPhone and iPad
Safari and home-screen icons need) only works when the auth handler is on the
app's own domain. Elsewhere, such as `npm run dev`, sign-in uses a popup.

```sh
npm run test:rules   # security rules, the Firestore store, sync, sign-out and
                     # Delete my data (offline too), on the Firestore emulator
npm run test:hosting # build, then check firebase.json's caching and rewrites
                     # on the Hosting emulator
npm run emulators    # auth + Firestore emulators for local sign-in (demo project)
npm run deploy       # build, then deploy hosting and rules (needs .env.local
                     # and the real project id in .firebaserc); refuses while
                     # VITE_FIREBASE_USE_EMULATORS is set
```

The emulator scripts use the `demo-time-off-tracker` project id, so they never
touch a real Firebase project. `scripts/make-icons.mjs` redraws the home-screen
icons.

Hosting serves `index.html` (and every other path) with `no-cache`, and the
hashed files in `/assets/` as immutable for a year. A missing `/assets/` file
is a 404, never the page, so a stale tab can't cache the page as a script.

All example data in this repo (for example the "Sam" fixture) is made up.

## License

MIT. See [LICENSE](LICENSE).
