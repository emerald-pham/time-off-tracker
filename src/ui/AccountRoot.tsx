import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, AuthGateway } from "../auth/firebase";
import { deleteMyData, handOffOnSignIn, signOut, UnsyncedChangesError } from "../auth/sync";
import type { HandoffChoice } from "../auth/sync";
import type { DataStore } from "../storage";
import { AccountSection } from "./AccountSection";
import { App, AppHeader } from "./App";
import "./account.css";

type State =
  /** Waiting to hear from Firebase, after a visit that ended signed in. */
  | { kind: "starting" }
  | { kind: "signed-out" }
  /** `answer` is set while the first-sign-in question is up for this handoff. */
  | { kind: "handing-off"; account: Account; answer: ((choice: HandoffChoice) => void) | null }
  | { kind: "handoff-failed"; account: Account; error: string }
  | { kind: "signed-in"; account: Account; store: DataStore }
  /** "Delete my data" is done on this device; the account's copy goes when the server has the delete. */
  | { kind: "deleting"; account: Account };

interface Props {
  /** This device's signed-out copy. */
  local: DataStore;
  /**
   * Loads Firebase, after the app's first paint. Null when no Firebase config
   * was built in: signed-out only. Calling it again returns the same gateway.
   */
  connect: (() => Promise<AuthGateway>) | null;
  /**
   * Whether the last visit ended signed in, so that next time the page says
   * "Loading your account…" while Firebase starts, instead of showing this
   * device's empty signed-out copy.
   */
  signedInHint?: { read(): boolean; write(signedIn: boolean): void };
}

/**
 * Picks which store the app uses (this device while signed out, the account
 * while signed in) and runs the first-sign-in handoff.
 *
 * The app shows at once on this device's copy; Firebase loads behind it.
 * Each account change starts a fresh handoff, and a handoff that finishes
 * after the account changed again is dropped, along with its question.
 */
export function AccountRoot({ local, connect, signedInHint }: Props) {
  const [gateway, setGateway] = useState<AuthGateway | null>(null);
  const [state, setState] = useState<State>(() =>
    connect && signedInHint?.read() ? { kind: "starting" } : { kind: "signed-out" },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Sign-out was refused because changes haven't reached the account. */
  const [unsyncedAtSignOut, setUnsyncedAtSignOut] = useState(false);
  // Bumped to make the app start over from its store.
  const [generation, setGeneration] = useState(0);
  /** Which handoff is current; every account change moves it on. */
  const handoff = useRef(0);

  const startHandoff = useCallback(
    (gw: AuthGateway, account: Account) => {
      const token = ++handoff.current;
      const current = () => handoff.current === token;
      setError(null);
      setState({ kind: "handing-off", account, answer: null });
      const store = gw.accountStore(account.uid);
      const ask = () =>
        new Promise<HandoffChoice>((resolve) => {
          if (current()) setState({ kind: "handing-off", account, answer: resolve });
        });
      handOffOnSignIn({ device: local, account: store, ask }).then(
        () => {
          if (!current()) return;
          setState({ kind: "signed-in", account, store });
          signedInHint?.write(true);
        },
        (e: unknown) =>
          current() &&
          setState({ kind: "handoff-failed", account, error: `Couldn't load your account's data: ${message(e)}` }),
      );
    },
    [local, signedInHint],
  );

  // Load Firebase once the app is on screen. If it can't load, the app
  // carries on signed out.
  useEffect(() => {
    if (!connect) return;
    let live = true;
    const timer = setTimeout(() => {
      connect().then(
        (gw) => live && setGateway(gw),
        (e: unknown) => live && setError(`Sign-in isn't available right now: ${message(e)}`),
      );
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [connect]);

  useEffect(() => {
    if (!gateway) return;
    let live = true;
    void gateway.redirectError().then((m) => live && m && setError(m));
    const unsubscribe = gateway.onAccountChanged((account) => {
      if (!live) return;
      if (account) {
        startHandoff(gateway, account);
        return;
      }
      handoff.current++;
      setState({ kind: "signed-out" });
      signedInHint?.write(false);
    });
    return () => {
      live = false;
      handoff.current++;
      unsubscribe();
    };
  }, [gateway, startHandoff, signedInHint]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setUnsyncedAtSignOut(false);
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, []);

  if (state.kind === "starting") {
    return (
      <div className="app">
        <AppHeader />
        {error ? (
          <>
            <p className="app-error" role="alert">
              {error}
            </p>
            <p>
              <button type="button" className="button primary" onClick={() => window.location.reload()}>
                Try again
              </button>
            </p>
          </>
        ) : (
          <p className="account-status">Loading your account…</p>
        )}
      </div>
    );
  }

  if (state.kind === "handing-off") {
    return (
      <div className="app">
        <AppHeader />
        {state.answer ? (
          <HandoffQuestion email={state.account.email} onAnswer={state.answer} />
        ) : (
          <p className="account-status">Loading your account…</p>
        )}
      </div>
    );
  }

  if (state.kind === "handoff-failed") {
    const { account } = state;
    return (
      <div className="app">
        <AppHeader />
        <section className="handoff" role="alert" aria-labelledby="handoff-failed-title">
          <h2 id="handoff-failed-title">Signed in{account.email ? ` as ${account.email}` : ""}</h2>
          <p>{state.error}</p>
          <p>This device's data is still here, and nothing has been changed.</p>
          <div className="handoff-actions">
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => gateway && startHandoff(gateway, account)}
            >
              Try again
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => gateway && run(() => gateway.signOut())}
            >
              Sign out
            </button>
          </div>
          {error && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    );
  }

  if (state.kind === "deleting") {
    return (
      <div className="app">
        <AppHeader />
        <section className="handoff" role="status" aria-labelledby="deleting-title">
          <h2 id="deleting-title">Deleting your data</h2>
          <p>
            Your data is gone from this device. The copy in your account is deleted as soon as this device is online,
            and then you're signed out. If you're offline, this finishes when you're back online.
          </p>
          <p>
            If you close the app before then, the delete still goes through the next time you open it online, but
            you'll need to sign out yourself.
          </p>
        </section>
      </div>
    );
  }

  const signedIn = state.kind === "signed-in" ? state : null;
  // The app follows its store live, so edits on other devices show up as they sync.
  const active = signedIn ? signedIn.store : local;

  const signOutNow = (discardUnsynced: boolean) =>
    gateway &&
    run(async () => {
      try {
        await signOut({ device: local, session: gateway, discardUnsynced });
      } catch (e) {
        if (!(e instanceof UnsyncedChangesError)) throw e;
        setUnsyncedAtSignOut(true);
      }
    });

  const deleteNow = () =>
    run(async () => {
      if (!signedIn || !gateway) {
        await deleteMyData({ device: local, account: null, session: null });
        setGeneration((g) => g + 1);
        return;
      }
      const { account: who, store } = signedIn;
      // Done on this device at once; the rest needs the server, which may
      // mean waiting until the device is back online.
      const { accountDeleted } = await deleteMyData({ device: local, account: store, session: gateway });
      setState({ kind: "deleting", account: who });
      accountDeleted.catch((e: unknown) => {
        setError(`Couldn't delete your account's data: ${message(e)}`);
        setState({ kind: "signed-in", account: who, store: gateway.accountStore(who.uid) });
      });
    });

  const account = (
    <AccountSection
      email={signedIn?.account.email ?? null}
      canSignIn={gateway !== null}
      signedIn={signedIn !== null}
      busy={busy}
      error={error}
      unsyncedAtSignOut={unsyncedAtSignOut}
      onSignIn={() => gateway && run(() => gateway.signIn())}
      onSignOut={() => signOutNow(false)}
      onDiscardAndSignOut={() => signOutNow(true)}
      onDelete={deleteNow}
    />
  );

  return <App key={`${state.kind}:${generation}`} store={active} account={account} />;
}

function HandoffQuestion({
  email,
  onAnswer,
}: {
  email: string | null;
  onAnswer: (choice: HandoffChoice) => void;
}) {
  return (
    <section className="handoff" role="dialog" aria-labelledby="handoff-title">
      <h2 id="handoff-title">Your account already has data</h2>
      <p>
        {email ? `${email} already` : "This account already"} has saved data, and so does this
        device. Pick one to keep. They won't be combined.
      </p>
      <div className="handoff-actions">
        <button type="button" className="button primary" onClick={() => onAnswer("keep-account")}>
          Keep your account's data
        </button>
        <button type="button" className="button" onClick={() => onAnswer("replace-with-device")}>
          Replace it with this device's data
        </button>
      </div>
    </section>
  );
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
