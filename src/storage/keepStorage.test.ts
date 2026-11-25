import { describe, expect, it, vi } from "vitest";
import { askToKeepStorage } from "./keepStorage";

describe("askToKeepStorage (finding 21)", () => {
  it("asks the browser to keep this site's storage", async () => {
    const persist = vi.fn(async () => true);
    expect(await askToKeepStorage({ persisted: async () => false, persist })).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("doesn't ask again once it's kept", async () => {
    const persist = vi.fn(async () => true);
    expect(await askToKeepStorage({ persisted: async () => true, persist })).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("copes with browsers that don't have it, or refuse", async () => {
    expect(await askToKeepStorage(undefined)).toBe(false);
    expect(await askToKeepStorage({})).toBe(false);
    expect(
      await askToKeepStorage({
        persisted: async () => false,
        persist: async () => {
          throw new Error("SecurityError");
        },
      }),
    ).toBe(false);
  });
});
