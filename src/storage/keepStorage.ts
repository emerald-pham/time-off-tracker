/**
 * Asks the browser to keep this site's storage rather than clear it to free
 * space or after a while. Safari otherwise deletes a site's local storage
 * after 7 days without a visit; apps on the Home Screen are exempt. Resolves
 * true once the browser agrees, and never throws: it's a request, not a need.
 */
export async function askToKeepStorage(
  storage: Partial<Pick<StorageManager, "persist" | "persisted">> | undefined = globalThis.navigator?.storage,
): Promise<boolean> {
  try {
    if (!storage?.persist) return false;
    if (await storage.persisted?.()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
