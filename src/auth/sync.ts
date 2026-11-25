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

/** The signed-in session (the Firebase gateway). */
export interface Session {
  /**
   * True once every change waiting on this device has reached the account;
   * false if that takes more than a few seconds (offline, say).
   */
  changesSynced(): Promise<boolean>;
  /**
   * Signs out and wipes this device's offline copy of the account, including
   * any change still waiting there to be sent.
   */
  signOut(): Promise<void>;
}

/** Signing out now would throw away changes that haven't reached the account. */
export class UnsyncedChangesError extends Error {
  constructor() {
    super(
      "Some changes on this device haven't reached your account yet, maybe because you're offline. Signing out now would lose them.",
    );
    this.name = "UnsyncedChangesError";
  }
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
 *
 * Every open tab sees the sign-in and may ask. The device copy is shared, so
 * once one tab has finished it's gone, and a later answer in another tab
 * leaves the account alone rather than replacing it a second time.
 */
export async function handOffOnSignIn({ device, account, ask }: Handoff): Promise<AppData | null> {
  const saved = await device.load();
  const local = saved === null || isEmptyAppData(saved) ? null : saved;
  const remote = await account.load();
  // Either side holding only the defaults counts as empty, so nothing is asked.
  const remoteHasData = remote !== null && !isEmptyAppData(remote);

  let result = remote;
  if (local !== null) {
    let replaceWith: AppData | null = local;
    if (remoteHasData && !sameAppData(local, remote)) {
      const keepAccount = (await ask()) === "keep-account";
      // Another tab may have finished the handoff while the question was up.
      const current = keepAccount ? null : await device.load();
      replaceWith = current && !isEmptyAppData(current) ? current : null;
      if (!keepAccount && replaceWith === null) return account.load();
    } else if (remoteHasData) {
      replaceWith = null;
    }
    if (replaceWith !== null) {
      await account.save(replaceWith);
      result = replaceWith;
    }
  }
  if (saved !== null) await device.clear();
  return result;
}

/**
 * Sign out clears the device copy. The account's copy stays, so signing out
 * waits for every change to reach it first: if some haven't (offline), it
 * refuses with UnsyncedChangesError and clears nothing, unless the person
 * chose to discard them.
 */
export async function signOut({
  device,
  session,
  discardUnsynced = false,
}: {
  device: DataStore;
  session: Session;
  discardUnsynced?: boolean;
}) {
  if (!discardUnsynced && !(await session.changesSynced())) throw new UnsyncedChangesError();
  await device.clear();
  await session.signOut();
}

/**
 * "Delete my data": deletes the account's copy (signed in), then the device
 * copy, then signs out. Signed in, it needs the server: offline it refuses
 * (OfflineError) and nothing is deleted, rather than leave a delete waiting
 * to run later over whatever other devices saved meanwhile. If the account's
 * copy can't be deleted, nothing else is.
 */
export async function deleteMyData({
  device,
  account,
  session,
}: {
  device: DataStore;
  account: DataStore | null;
  session: Session | null;
}): Promise<void> {
  if (account) await account.clear();
  await device.clear();
  if (session) await session.signOut();
}
