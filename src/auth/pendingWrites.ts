import { waitForPendingWrites } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

/**
 * True once every write waiting on this device (from any tab: they share the
 * offline cache) has reached the server; false if that takes longer than `ms`,
 * as it does offline, where Firestore holds writes until it reconnects.
 */
export async function writesSyncedWithin(db: Firestore, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([waitForPendingWrites(db).then(() => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
