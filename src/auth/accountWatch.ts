/**
 * Decides when a tab must reload because its session changed underneath it.
 *
 * When one tab signs out, it clears Firestore's offline cache, and the SDK
 * shuts down every other tab's Firestore client to let the clear go through,
 * without marking it terminated. Those tabs would then wait forever on reads
 * and writes, so a tab reloads, and gets a fresh client, when:
 * - its signed-in account signs out or changes,
 * - another tab says it's signing out (a hidden tab may not hear about the
 *   sign-out for a minute, and not at all if the same account signs straight
 *   back in), or
 * - its Firestore client turns out to be shut down.
 * A sign-out started in this tab is left alone: it reloads by itself once the
 * cache is cleared.
 */
export function accountWatch(reload: () => void) {
  let current: string | null | undefined;
  let leaving = false;
  let reloading = false;
  const reloadOnce = () => {
    if (leaving || reloading) return;
    reloading = true;
    reload();
  };
  return {
    /** This tab is signing out. */
    leaving() {
      leaving = true;
    },
    /** Another tab announced it's signing out. */
    otherTabSignedOut: reloadOnce,
    /** This tab's Firestore client was shut down underneath it. */
    clientLost: reloadOnce,
    /** Notes who's signed in now. False means the tab is reloading, so pass the change on to no one. */
    accountChanged(uid: string | null): boolean {
      if (reloading) return false;
      if (!leaving && current && uid !== current) {
        reloadOnce();
        return false;
      }
      current = uid;
      return true;
    },
  };
}
