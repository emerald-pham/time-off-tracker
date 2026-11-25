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
 */
export async function handOffOnSignIn({ device, account, ask }: Handoff): Promise<AppData | null> {
  const saved = await device.load();
  const local = saved === null || isEmptyAppData(saved) ? null : saved;
  const remote = await account.load();
  // Either side holding only the defaults counts as empty, so nothing is asked.
  const remoteHasData = remote !== null && !isEmptyAppData(remote);

  let result = remote;
  if (local !== null) {
    const keepAccount =
      remoteHasData && (sameAppData(local, remote) || (await ask()) === "keep-account");
    if (!keepAccount) {
      await account.save(local);
      result = local;
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
 * "Delete my data": removes the device copy and, signed in, the account's
 * copy. Resolves as soon as both are gone from this device; from then on the
 * account's store refuses any save, so a later edit can't bring the data back.
 *
 * `accountDeleted` resolves once the server has the delete and the person is
 * signed out, which offline waits until they're back online: signing out any
 * sooner would wipe the queued delete along with the offline cache. It
 * rejects, without signing out, if the server refuses the delete.
 */
export async function deleteMyData({
  device,
  account,
  session,
}: {
  device: DataStore;
  account: DataStore | null;
  session: Session | null;
}): Promise<{ accountDeleted: Promise<void> }> {
  if (account) await account.clear();
  await device.clear();
  if (!account || !session) return { accountDeleted: Promise.resolve() };
  return { accountDeleted: account.synced().then(() => session.signOut()) };
}
