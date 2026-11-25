interface Props {
  /** Null while signed out. */
  email: string | null;
  /** False when the build has no Firebase config: the sign-in button is hidden. */
  canSignIn: boolean;
  signedIn: boolean;
  busy: boolean;
  error: string | null;
  /** Sign-out was refused: some changes haven't reached the account yet. */
  unsyncedAtSignOut: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  /** Signs out even though some changes haven't reached the account. */
  onDiscardAndSignOut: () => void;
  onDelete: () => void;
}

/** The Settings "Account" section. */
export function AccountSection({
  email,
  canSignIn,
  signedIn,
  busy,
  error,
  unsyncedAtSignOut,
  onSignIn,
  onSignOut,
  onDiscardAndSignOut,
  onDelete,
}: Props) {
  const confirmDelete = () => {
    const question = signedIn
      ? "Delete your data from your account and from this device? This can't be undone."
      : "Delete your data from this device? This can't be undone.";
    if (window.confirm(question)) onDelete();
  };

  return (
    <section className="account" aria-labelledby="account-heading">
      <h3 id="account-heading" className="settings-heading">
        Account
      </h3>
      {signedIn ? (
        <p className="account-status">
          Signed in{email ? ` as ${email}` : ""}. Your data syncs to your other devices.
        </p>
      ) : (
        <p className="account-status">
          Your data is saved on this device only.
          {canSignIn && " Sign in with Google to sync it to your other devices."}
        </p>
      )}

      <div className="account-actions">
        {signedIn ? (
          <button type="button" className="button" onClick={onSignOut} disabled={busy}>
            Sign out
          </button>
        ) : (
          canSignIn && (
            <button type="button" className="button primary" onClick={onSignIn} disabled={busy}>
              Sign in with Google
            </button>
          )
        )}
        <button type="button" className="button danger" onClick={confirmDelete} disabled={busy}>
          Delete my data
        </button>
      </div>
      {signedIn && (
        <p className="account-note">
          Signing out removes your data from this device. It stays in your account: if some changes haven't reached
          it yet, you're asked first.
        </p>
      )}
      {unsyncedAtSignOut && (
        <div className="account-error" role="alert">
          <p>
            Some changes on this device haven't reached your account yet, maybe because you're offline. Signing out
            now would lose them. Get back online and try again, or discard them.
          </p>
          <button type="button" className="button danger" onClick={onDiscardAndSignOut} disabled={busy}>
            Discard unsynced changes and sign out
          </button>
        </div>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
