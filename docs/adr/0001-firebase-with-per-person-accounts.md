# Firebase, with optional Google sign-in for sync

The tracker runs on Firebase Hosting, and signing in is optional. Without signing in, someone's data stays on that one device. Signing in with Google syncs it across their devices through Firebase's database, and each account sees only its own data. The owner uses the tracker on iPad, iPhone and Mac, and coworkers will use it too. So we needed sync and per-person privacy, without making sign-in a hurdle for someone who only wants to try it.

The source is in a public GitHub repo. GitHub Pages is not the host.

## Considered Options

- **GitHub Pages with browser-only storage**: free and simple. Rejected because data stays on one device and there are no accounts.
- **Private Claude Artifact with built-in storage**: nothing to host or run. Rejected because it can't give coworkers their own accounts.
- **Sign-in required**: simpler to build, since there's only one storage path. Rejected because it puts a hurdle in front of coworkers who only want to try the tracker.

## Consequences

- The tracker needs two storage paths, on the device and in the account, plus a handoff when someone who has been using it without signing in signs in for the first time.
- Because the repo is public, examples and test data must be made up, never the owner's real hire date, balances or Occasions.
