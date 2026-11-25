import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { firebaseConfigFromEnv } from "./auth/config";
import { LocalDataStore } from "./storage";
import { AccountRoot } from "./ui/AccountRoot";
import "./ui/styles.css";

async function start() {
  const local = new LocalDataStore(window.localStorage);
  // Without VITE_FIREBASE_* config the app runs signed-out only, and the
  // Firebase SDK is never loaded.
  const config = firebaseConfigFromEnv(import.meta.env);
  const useEmulators = import.meta.env.VITE_FIREBASE_USE_EMULATORS === "true";
  const gateway = config
    ? (await import("./auth/firebase")).connectFirebase(config, useEmulators)
    : null;

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AccountRoot local={local} gateway={gateway} />
    </StrictMode>,
  );
}

void start();
