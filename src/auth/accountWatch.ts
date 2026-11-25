/**
 * Decides when a tab must reload because its account changed underneath it.
 *
 * When one tab signs out, it clears Firestore's offline cache, and the SDK
 * shuts down every other tab's Firestore client to let the clear go through,
 * without marking it terminated. Those tabs would then wait forever on reads
 * and writes, so a tab that sees its signed-in account sign out or change
 * reloads, and gets a fresh client. A sign-out started in this tab is left
 * alone: it reloads by itself once the cache is cleared.
 */
export function accountWatch(reload: () => void) {
  let current: string | null | undefined;
  let leaving = false;
  let reloading = false;
  return {
    /** This tab is signing out. */
    leaving() {
      leaving = true;
    },
    /** Notes who's signed in now. False means the tab is reloading, so pass the change on to no one. */
    accountChanged(uid: string | null): boolean {
      if (reloading) return false;
      if (!leaving && current && uid !== current) {
        reloading = true;
        reload();
        return false;
      }
      current = uid;
      return true;
    },
  };
}
