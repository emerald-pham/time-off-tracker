import { describe, expect, it, vi } from "vitest";
import { accountWatch } from "./accountWatch";

describe("accountWatch: when a tab must reload", () => {
  it("reloads a tab whose account signs out elsewhere, and passes nothing on", () => {
    const reload = vi.fn();
    const watch = accountWatch(reload);
    expect(watch.accountChanged("made-up-uid")).toBe(true);
    expect(watch.accountChanged(null)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("keeps passing nothing on once it's reloading", () => {
    const reload = vi.fn();
    const watch = accountWatch(reload);
    watch.accountChanged("made-up-uid");
    watch.accountChanged(null);
    expect(watch.accountChanged("made-up-uid")).toBe(false);
  });

  it("reloads when the account changes to another one", () => {
    const reload = vi.fn();
    const watch = accountWatch(reload);
    watch.accountChanged("first-uid");
    expect(watch.accountChanged("second-uid")).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("doesn't reload on the first answer, on signing in, or on the same account again", () => {
    const reload = vi.fn();
    const watch = accountWatch(reload);
    expect(watch.accountChanged(null)).toBe(true);
    expect(watch.accountChanged("made-up-uid")).toBe(true);
    expect(watch.accountChanged("made-up-uid")).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads when another tab says it's signing out, even if this tab never hears the account change", () => {
    // Signed straight back in as the same account, Firebase reports no change here.
    const reload = vi.fn();
    const watch = accountWatch(reload);
    watch.accountChanged("made-up-uid");
    watch.otherTabSignedOut();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads when this tab's Firestore client was shut down underneath it", () => {
    const reload = vi.fn();
    const watch = accountWatch(reload);
    watch.accountChanged("made-up-uid");
    watch.clientLost();
    watch.clientLost();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("ignores both while this tab is the one signing out", () => {
    const reload = vi.fn();
    const watch = accountWatch(reload);
    watch.accountChanged("made-up-uid");
    watch.leaving();
    watch.otherTabSignedOut();
    watch.clientLost();
    expect(reload).not.toHaveBeenCalled();
  });

  it("leaves a sign-out started in this tab alone: it reloads by itself once the cache is cleared", () => {
    const reload = vi.fn();
    const watch = accountWatch(reload);
    watch.accountChanged("made-up-uid");
    watch.leaving();
    expect(watch.accountChanged(null)).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
});
