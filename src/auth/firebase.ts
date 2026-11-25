import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
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
  doc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  waitForPendingWrites,
} from "firebase/firestore";
import { FirestoreDataStore } from "../storage/firestoreDataStore";
import type { DataStore } from "../storage";
import type { FirebaseWebConfig } from "./config";
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
   * on the device, and reloads the page.
   */
  signOut(): Promise<void>;
  /** The account's copy, `users/{uid}`. */
  accountStore(uid: string): DataStore;
  /** The error from a redirect sign-in that just came back, if it failed. */
  redirectError(): Promise<string | null>;
}

const PENDING_WRITES_WAIT_MS = 4000;

export function connectFirebase(config: FirebaseWebConfig): AuthGateway {
  const app = initializeApp(config);
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // Offline persistence: saves land in the device cache and sync when online.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  return {
    onAccountChanged(callback) {
      return onAuthStateChanged(auth, (user) =>
        callback(user ? { uid: user.uid, email: user.email } : null),
      );
    },

    async signIn() {
      if (signInMethod(window.location.hostname, config.authDomain) === "redirect") {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    },

    async signOut() {
      // Give unsynced edits a moment to reach the account before signing out.
      await Promise.race([
        waitForPendingWrites(db),
        new Promise((resolve) => setTimeout(resolve, PENDING_WRITES_WAIT_MS)),
      ]);
      await firebaseSignOut(auth);
      await terminate(db);
      try {
        await clearIndexedDbPersistence(db);
      } catch {
        // Another tab of the app still has the cache open, so it can't be
        // deleted now. Signing out from that tab, or closing it and signing
        // out again, clears it.
      }
      window.location.reload();
    },

    accountStore(uid) {
      return new FirestoreDataStore(doc(db, "users", uid));
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
