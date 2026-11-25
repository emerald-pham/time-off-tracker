import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { firebaseConfigFromEnv, useEmulatorsFromEnv } from "./auth/config";
import type { AuthGateway } from "./auth/firebase";
import { LocalDataStore, storedFlag } from "./storage";
import { AccountRoot } from "./ui/AccountRoot";
import { ErrorBoundary, PageError } from "./ui/ErrorBoundary";
import "./ui/styles.css";

// Without VITE_FIREBASE_* config the app runs signed-out only, and the
// Firebase SDK is never loaded.
const config = firebaseConfigFromEnv(import.meta.env);
// Only `npm run dev` on a demo- project; never a production build.
const useEmulators = useEmulatorsFromEnv(import.meta.env);

let gateway: Promise<AuthGateway> | null = null;
/** Loads the Firebase SDK on first use, and only once. */
const connect = config
  ? () => (gateway ??= import("./auth/firebase").then((m) => m.connectFirebase(config, useEmulators)))
  : null;

/** The browser's `storage` event: another tab changed local storage. */
function storageEvents(key: string, onChange: () => void): () => void {
  const listener = (e: StorageEvent) => {
    if (e.key === key || e.key === null) onChange();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

// A getter, because even reading window.localStorage throws when the browser
// blocks storage; the store then carries on in memory.
const deviceStorage = () => window.localStorage;
const local = new LocalDataStore(deviceStorage, { watch: storageEvents });
const signedInHint = storedFlag(deviceStorage, "time-off-tracker:signed-in");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallback={(error) => <PageError error={error} />}>
      <AccountRoot local={local} connect={connect} signedInHint={signedInHint} />
    </ErrorBoundary>
  </StrictMode>,
);
