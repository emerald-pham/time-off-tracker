import { isEmptyAppData, sameAppData } from "../storage";
import type { AppData, DataStore } from "../storage";

/**
 * Moving data between the two storage paths (ADR 0001, spec "Accounts and
 * sync"). Signed out, data lives in the device copy (local storage). Signed
 * in, it lives in the account (`users/{uid}`, with Firestore's offline cache
 * on the device), and the local-storage copy is emptied.
 */

/** The two answers to the first-sign-in question. Never merge. */
export type HandoffChoice = "keep-account" | "replace-with-device";

/** The signed-in session. Its `signOut` also wipes the offline cache. */
export interface Session {
  signOut(): Promise<void>;
}

export interface Handoff {
  /** This device's signed-out copy (local storage). */
  device: DataStore;
  /** The signed-in account's copy (`users/{uid}`). */
  account: DataStore;
  /** Asks "Keep your account's data / Replace it with this device's data". */
  ask: () => Promise<HandoffChoice>;
}

/**
 * Runs whenever someone is signed in. If this device has signed-out data, it
 * moves up when the account is empty; otherwise the person picks one side.
 * Either way the device copy is then emptied, so the question comes up once.
 * Returns the data the account now holds, which the app shows while signed in.
 */
export async function handOffOnSignIn({ device, account, ask }: Handoff): Promise<AppData | null> {
  const saved = await device.load();
  const local = saved === null || isEmptyAppData(saved) ? null : saved;
  const remote = await account.load();

  let result = remote;
  if (local !== null) {
    const keepAccount =
      remote !== null && (sameAppData(local, remote) || (await ask()) === "keep-account");
    if (!keepAccount) {
      await account.save(local);
      result = local;
    }
  }
  if (saved !== null) await device.clear();
  return result;
}

/** Sign out clears the device copy. The account's copy stays. */
export async function signOut({ device, session }: { device: DataStore; session: Session }) {
  await device.clear();
  await session.signOut();
}

/**
 * "Delete my data": removes the account's copy (when signed in) and the device
 * copy, then signs out. If the account's copy can't be removed, nothing else is.
 */
export async function deleteMyData({
  device,
  account,
  session,
}: {
  device: DataStore;
  account: DataStore | null;
  session: Session | null;
}) {
  if (account) await account.clear();
  await device.clear();
  if (session) await session.signOut();
}
