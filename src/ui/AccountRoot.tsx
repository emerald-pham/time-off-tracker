import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account, AuthGateway } from "../auth/firebase";
import { deleteMyData, handOffOnSignIn, signOut } from "../auth/sync";
import type { HandoffChoice } from "../auth/sync";
import { sameAppData } from "../storage";
import type { AppData, DataStore } from "../storage";
import { AccountSection } from "./AccountSection";
import { App } from "./App";
import "./account.css";

type State =
  | { kind: "starting" }
  | { kind: "signed-out" }
  | { kind: "handing-off"; account: Account }
  | { kind: "signed-in"; account: Account; store: DataStore };

interface Props {
  /** This device's signed-out copy. */
  local: DataStore;
  /** Null when no Firebase config was built in: signed-out only. */
  gateway: AuthGateway | null;
}

/**
 * Picks which store the app uses (this device while signed out, the account
 * while signed in), runs the first-sign-in handoff, and remounts the app when
 * its store or data changes underneath it.
 */
export function AccountRoot({ local, gateway }: Props) {
  const [state, setState] = useState<State>(gateway ? { kind: "starting" } : { kind: "signed-out" });
  const [question, setQuestion] = useState<((choice: HandoffChoice) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped to make the app reload its data from the store.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!gateway) return;
    let live = true;
    void gateway.redirectError().then((message) => live && message && setError(message));

    const unsubscribe = gateway.onAccountChanged((account) => {
      if (!live) return;
      if (!account) {
        setState({ kind: "signed-out" });
        return;
      }
      setState({ kind: "handing-off", account });
      const store = gateway.accountStore(account.uid);
      const ask = () =>
        new Promise<HandoffChoice>((resolve) => setQuestion(() => resolve));
      handOffOnSignIn({ device: local, account: store, ask })
        .then(() => setState({ kind: "signed-in", account, store }))
        .catch((e: unknown) => {
          setError(`Couldn't load your account's data: ${message(e)}`);
          setState({ kind: "signed-out" });
        });
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [gateway, local]);

  const signedIn = state.kind === "signed-in" ? state : null;
  const active = signedIn ? signedIn.store : local;

  // Remembers what the app last loaded or saved, so a returning app can tell
  // whether another device changed the data meanwhile.
  const last = useRef<AppData | null>(null);
  const tracked = useMemo<DataStore>(
    () => ({
      load: async () => (last.current = await active.load()),
      save: async (data) => {
        last.current = data;
        await active.save(data);
      },
      clear: () => active.clear(),
    }),
    [active],
  );

  // When a signed-in app comes back to the foreground, pick up edits made
  // on another device.
  useEffect(() => {
    if (!signedIn) return;
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const latest = await signedIn.store.load().catch(() => undefined);
      if (latest === undefined) return;
      const unchanged =
        latest === null ? last.current === null : last.current !== null && sameAppData(latest, last.current);
      if (!unchanged) setGeneration((g) => g + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [signedIn]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, []);

  if (state.kind === "starting") return null;

  if (state.kind === "handing-off") {
    return (
      <div className="app">
        {question ? (
          <HandoffQuestion
            email={state.account.email}
            onAnswer={(choice) => {
              question(choice);
              setQuestion(null);
            }}
          />
        ) : (
          <p className="account-status">Loading your account…</p>
        )}
      </div>
    );
  }

  const account = (
    <AccountSection
      email={signedIn?.account.email ?? null}
      canSignIn={gateway !== null}
      signedIn={signedIn !== null}
      busy={busy}
      error={error}
      onSignIn={() => gateway && run(() => gateway.signIn())}
      onSignOut={() => gateway && run(() => signOut({ device: local, session: gateway }))}
      onDelete={() =>
        run(async () => {
          await deleteMyData({
            device: local,
            account: signedIn?.store ?? null,
            session: signedIn ? gateway : null,
          });
          setGeneration((g) => g + 1);
        })
      }
    />
  );

  return <App key={`${state.kind}:${generation}`} store={tracked} account={account} />;
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
