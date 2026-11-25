import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
} from "firebase/firestore";
import { FirestoreDataStore } from "../storage/firestoreDataStore";
import type { DataStore } from "../storage";
import { accountWatch } from "./accountWatch";
import type { FirebaseWebConfig } from "./config";
import { writesSyncedWithin } from "./pendingWrites";
import { signInMethod } from "./signInMethod";
import type { Session } from "./sync";

/** Who is signed in. */
export interface Account {
  uid: string;
  email: string | null;
}

/** Everything the UI needs from Firebase, so the rest of the app never imports it. */
export interface AuthGateway extends Session {
  /** Calls back with the signed-in account, or null. Returns the unsubscribe. */
  onAccountChanged(callback: (account: Account | null) => void): () => void;
  /** Starts Google sign-in. A redirect leaves the page and comes back signed in. */
  signIn(): Promise<void>;
  /**
   * Signs out, then wipes Firestore's offline cache so no account data stays
   * on the device, and reloads the page. It doesn't check for unsynced
   * changes: src/auth/sync.ts does that first, with `changesSynced`.
   */
  signOut(): Promise<void>;
  /** The account's copy, `users/{uid}`. */
  accountStore(uid: string): DataStore;
  /** The error from a redirect sign-in that just came back, if it failed. */
  redirectError(): Promise<string | null>;
}

/** How long sign-out gives a change made just now to reach the account. */
const SYNC_WAIT_MS = 4000;

/** A tab about to clear the offline cache writes here, so every other tab reloads. */
const SIGNING_OUT_KEY = "time-off-tracker:signing-out";

/**
 * `useEmulators` points auth and Firestore at the local emulators
 * (`npm run emulators`), for trying sign-in with a `demo-` project. It's
 * ignored for any other project.
 */
export function connectFirebase(config: FirebaseWebConfig, useEmulators = false): AuthGateway {
  const app = initializeApp(config);
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // Offline persistence: saves land in the device cache and sync when online.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (useEmulators && config.projectId.startsWith("demo-")) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  // Another tab signing out shuts this tab's Firestore client down, so this
  // tab reloads when its account signs out or changes, when another tab says
  // it's signing out (the storage event reaches hidden tabs at once), or when
  // its client turns out to be shut down.
  const watch = accountWatch(() => window.location.reload());
  window.addEventListener("storage", (e) => {
    if (e.key === SIGNING_OUT_KEY && e.newValue) watch.otherTabSignedOut();
  });

  return {
    onAccountChanged(callback) {
      return onAuthStateChanged(auth, (user) => {
        if (watch.accountChanged(user?.uid ?? null)) {
          callback(user ? { uid: user.uid, email: user.email } : null);
        }
      });
    },

    async signIn() {
      if (signInMethod(window.location.hostname, config.authDomain) === "redirect") {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    },

    changesSynced() {
      return writesSyncedWithin(db, SYNC_WAIT_MS);
    },

    async signOut() {
      watch.leaving();
      await firebaseSignOut(auth);
      await terminate(db);
      try {
        // Auth is already signed out, so the other tabs reload signed out.
        window.localStorage.setItem(SIGNING_OUT_KEY, String(Date.now()));
      } catch {
        // Storage is blocked: the other tabs still reload once they see the sign-out.
      }
      try {
        // Deleting the cache doesn't wait for other tabs: the SDK closes their
        // connection to it, which shuts down their Firestore client too.
        // That's why every other tab reloads when it sees this sign-out.
        await clearIndexedDbPersistence(db);
      } catch (error) {
        // IndexedDB itself failed. Nothing more can be done from here.
        console.error("Couldn't clear the offline copy of your account", error);
      }
      window.location.reload();
    },

    accountStore(uid) {
      return new FirestoreDataStore(doc(db, "users", uid), { onClientLost: () => watch.clientLost() });
    },

    async redirectError() {
      try {
        await getRedirectResult(auth);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  };
}
