# 04: Sync and publish

Status: ready-for-agent
Blocked by: 01 (easiest after 02)
Spec: [spec.md](../spec.md), section Accounts and sync. [ADR 0001](../../../docs/adr/0001-firebase-with-per-person-accounts.md).

## Needs from the owner first

These are account steps the agent can't do:
1. Create a Firebase project and a web app.
2. Turn on Google as a sign-in provider and create a Firestore database.
3. Create the public GitHub repo, or approve the agent creating it with `gh`.
4. Add the deploy secret (`FIREBASE_SERVICE_ACCOUNT`) to the repo.

## Outcome

The tracker is live on a Firebase URL. It works with no account. Signing in with Google syncs the same data to iPad, iPhone and Mac. Coworkers can use it with their own private data.

## Scope

- Firebase Hosting config and a GitHub Actions deploy on every push to `main`.
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
