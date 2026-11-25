# 04: Sync and publish

Status: resolved
Blocked by: 01 (easiest after 02)
Spec: [spec.md](../spec.md), section Accounts and sync. [ADR 0001](../../../docs/adr/0001-firebase-with-per-person-accounts.md).

## Account steps (done by the coordinator, not the owner)

The owner wants to touch nothing. The coordinator handles these live steps once the code is merged and reviewed, and only after the owner explicitly approves them in chat:
1. Create the Firebase project and web app.
2. Turn on Google sign-in and create the Firestore database.
3. Deploy the rules and hosting from this machine. The Firebase CLI is already signed in.
4. Create the public GitHub repo with `gh` (already authenticated) and push.

The implementer builds everything else and keeps the Firebase config injectable, using `VITE_FIREBASE_*` env vars with an `.env.example`. Without config, the app runs signed-out only and hides the sign-in button.

Deploys run from the CLI on this machine. A GitHub Actions auto-deploy would need a service-account key, so it's out unless the owner asks for it.

## Outcome

The tracker is live on a Firebase URL. It works with no account. Signing in with Google syncs the same data to iPad, iPhone and Mac. Coworkers can use it with their own private data.

## Scope

- Firebase Hosting config (`firebase.json`, `.firebaserc` with a placeholder project id), plus an `npm run deploy` script.
- Firestore: one document per user at `users/{uid}`, with security rules limited to the owner and offline persistence on.
- **Signing in and out:**
  - Optional Google sign-in that works in iOS Safari and from a home-screen icon.
  - First sign-in handoff: if the account is empty, move the local data up. Otherwise ask "Keep your account's data / Replace with this device's data". Never merge.
  - Sign out clears the device copy. "Delete my data" removes both copies.
- A web app manifest and icons, so it can be installed on the home screen.
- Before the first public push, run the `secure-publish` review. The Firebase web config is public by design, but the security rules must not be left open.

## Acceptance

- Signed-out use works exactly as before.
- Signing in on two devices shows the same Ledger.
- A second Google account can't read the first account's document. Check this with the Firestore rules emulator test.
- The deployed URL loads on iPhone Safari, and sign-in completes there.

## Comments

Resolved on branch `time-off-tracker`.
- **Sync:** the account document is now version 2 (ADR 0003). The app follows the document live and writes only the fields it changed.
- **Sign-out:** refused while changes are unsynced, unless the user chooses to discard them.
- **Delete my data:** requires a connection to the server.
- **Testing:** emulator suites for the rules (41 tests) and hosting (6 tests).
- **Go-live:** deployed by the coordinator from the CLI to https://time-off-tracker-20261124.web.app. Tested on the live site: signed-out read, list and write are all refused with PERMISSION_DENIED. The browser key is restricted to the app's own domains.
- **Google sign-in:** enabled by the coordinator on 2026-11-25, with the owner's approval of the support email. That email is kept out of the repo. Authorized domains: `web.app` and `firebaseapp.com`. Live check: the Google account chooser opens with `redirect_uri=https://time-off-tracker-20261124.web.app/__/auth/handler`. The browser key answers from both app domains and is refused from another origin (`API_KEY_HTTP_REFERRER_BLOCKED`).
- **Not verified on a real device:** a full sign-in on iPhone Safari or from a home-screen icon. The emulator tests cover the flow after Google returns.
