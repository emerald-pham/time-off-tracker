// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { Account, AuthGateway } from "../auth/firebase";
import { LocalDataStore, memoryStorage } from "../storage";
import type { AppData, DataStore } from "../storage";
import { sam } from "../engine/fixtures";
import { AccountRoot } from "./AccountRoot";
import { button, click, field, flush, maybeButton, render, text } from "./testDom";
import type { Rendered } from "./testDom";

const deviceData: AppData = { settings: { ...sam, sapVacationHours: 40, sapAsOf: "2026-11-01" }, occasions: [], earnDateEdits: {} };
const xData: AppData = { ...deviceData, settings: { ...deviceData.settings, weeklyHours: 32 } };
const yData: AppData = { ...deviceData, settings: { ...deviceData.settings, weeklyHours: 24 } };
const X: Account = { uid: "x", email: "x@example.com" };
const Y: Account = { uid: "y", email: "y@example.com" };

/** An account store backed by memory. `gate` holds its loads; `failLoads` makes them fail. */
function accountStore(initial: AppData | null) {
  const inner = new LocalDataStore(memoryStorage());
  if (initial) void inner.save(initial);
  let release = () => {};
  let gate: Promise<void> | null = null;
  let synced: Promise<void> = Promise.resolve();
  const store = {
    failLoads: null as Error | null,
    holdLoads() {
      gate = new Promise((resolve) => (release = resolve));
    },
    releaseLoads: () => release(),
    /** Offline: writes land, but the server never answers until `online()`. */
    offline() {
      let answer = () => {};
      synced = new Promise((resolve) => (answer = resolve));
      return { online: () => answer() };
    },
    async load() {
      if (store.failLoads) throw store.failLoads;
      if (gate) await gate;
      return inner.load();
    },
    save: (d: AppData) => inner.save(d),
    update: (a: AppData, b: AppData) => inner.update(a, b),
    clear: () => inner.clear(),
    synced: () => synced,
    subscribe: inner.subscribe.bind(inner),
  };
  return store;
}

/** Stands in for the Firebase gateway: `emit` is what onAuthStateChanged would deliver. */
function fakeGateway(stores: Record<string, DataStore>) {
  const listeners = new Set<(a: Account | null) => void>();
  const gw = {
    current: null as Account | null,
    synced: true,
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    onAccountChanged(cb: (a: Account | null) => void) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    changesSynced: async () => gw.synced,
    accountStore: (uid: string) => stores[uid],
    redirectError: async () => null,
    async emit(a: Account | null) {
      gw.current = a;
      await act(async () => listeners.forEach((cb) => cb(a)));
      await flush();
    },
  };
  return gw;
}

let mounted: Rendered | null = null;
async function setup(stores: Record<string, DataStore>, deviceHas: AppData | null = deviceData) {
  const storage = memoryStorage();
  const local = new LocalDataStore(storage);
  if (deviceHas) await local.save(deviceHas);
  const gw = fakeGateway(stores);
  mounted = await render(<AccountRoot local={local} connect={async () => gw as unknown as AuthGateway} />);
  return { local, gw, el: mounted.el };
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
  vi.restoreAllMocks();
});

describe("starting up (finding 8)", () => {
  const never = () => new Promise<AuthGateway>(() => {});

  it("shows the app at once on this device's data while Firebase is still loading", async () => {
    const local = new LocalDataStore(memoryStorage());
    await local.save(deviceData);
    mounted = await render(<AccountRoot local={local} connect={never} />);
    expect(field(mounted.el, "Weekly hours").value).toBe("40");
    expect(text(mounted.el)).toContain("Account");
  });

  it("keeps working signed out, and says why, when Firebase can't load", async () => {
    const local = new LocalDataStore(memoryStorage());
    const connect = () => Promise.reject(new Error("Failed to fetch dynamically imported module"));
    mounted = await render(<AccountRoot local={local} connect={connect} />);
    expect(text(mounted.el)).toContain("Sign-in isn't available right now");
    expect(field(mounted.el, "Weekly hours")).toBeTruthy();
  });

  it("someone signed in last time sees Loading your account, not an empty signed-out app", async () => {
    const hint = { read: () => true, write: vi.fn() };
    mounted = await render(<AccountRoot local={new LocalDataStore(memoryStorage())} connect={never} signedInHint={hint} />);
    expect(text(mounted.el)).toContain("Loading your account");
    expect(text(mounted.el)).not.toContain("Enter your hire date");
  });

  it("remembers being signed in for next time, and forgets on sign-out", async () => {
    const hint = { read: () => false, write: vi.fn() };
    const gw = fakeGateway({ x: accountStore(xData) });
    mounted = await render(
      <AccountRoot local={new LocalDataStore(memoryStorage())} connect={async () => gw as unknown as AuthGateway} signedInHint={hint} />,
    );
    await gw.emit(X);
    expect(hint.write).toHaveBeenLastCalledWith(true);
    await gw.emit(null);
    expect(hint.write).toHaveBeenLastCalledWith(false);
  });
});

describe("a handoff that fails (finding 6)", () => {
  it("shows a signed-in error with Try again and Sign out, and keeps this device's data", async () => {
    const xs = accountStore(null);
    xs.failLoads = new Error("Failed to get document because the client is offline.");
    const { gw, el, local } = await setup({ x: xs });

    await gw.emit(X);

    expect(text(el)).toContain("Couldn't load your account's data");
    expect(text(el)).toContain("x@example.com");
    expect(button(el, "Try again")).toBeTruthy();
    expect(button(el, "Sign out")).toBeTruthy();
    expect(maybeButton(el, "Sign in with Google")).toBeUndefined();
    expect(await local.load()).toEqual(deviceData);
  });

  it("Try again runs the handoff again", async () => {
    const xs = accountStore(null);
    xs.failLoads = new Error("offline");
    const { gw, el, local } = await setup({ x: xs });
    await gw.emit(X);

    xs.failLoads = null;
    await click(button(el, "Try again"));

    expect(text(el)).toContain("Signed in as x@example.com");
    expect((await xs.load())?.settings).toEqual(deviceData.settings);
    expect(await local.load()).toBeNull();
  });

  it("Sign out from there signs out and leaves this device's data alone", async () => {
    const xs = accountStore(null);
    xs.failLoads = new Error("offline");
    const { gw, el, local } = await setup({ x: xs });
    await gw.emit(X);

    await click(button(el, "Sign out"));

    expect(gw.signOut).toHaveBeenCalledOnce();
    expect(await local.load()).toEqual(deviceData);
  });
});

describe("signing out before changes reach the account (finding 2)", () => {
  it("explains, and signs out only if the person chooses to discard them", async () => {
    const { gw, el } = await setup({ x: accountStore(xData) }, null);
    await gw.emit(X);
    gw.synced = false;

    await click(button(el, "Sign out"));
    expect(gw.signOut).not.toHaveBeenCalled();
    expect(text(el)).toContain("haven't reached your account yet");

    await click(button(el, "Discard unsynced changes and sign out"));
    expect(gw.signOut).toHaveBeenCalledOnce();
  });

  it("signs straight out once everything has synced", async () => {
    const { gw, el } = await setup({ x: accountStore(xData) }, null);
    await gw.emit(X);
    await click(button(el, "Sign out"));
    expect(gw.signOut).toHaveBeenCalledOnce();
    expect(maybeButton(el, "Discard unsynced changes and sign out")).toBeUndefined();
  });
});

describe("Delete my data while offline (finding 4)", () => {
  it("says it finishes when back online instead of loading forever, and leaves nothing to edit", async () => {
    const xs = accountStore(xData);
    const { gw, el } = await setup({ x: xs }, null);
    await gw.emit(X);
    const network = xs.offline();

    await click(button(el, "Delete my data"));

    expect(text(el)).toContain("finishes when you're back online");
    expect(text(el)).not.toContain("Loading your account");
    expect(el.querySelector("form.settings")).toBeNull();
    expect(gw.signOut).not.toHaveBeenCalled();
    expect(await xs.load()).toBeNull();

    network.online();
    await flush();
    expect(gw.signOut).toHaveBeenCalledOnce();
  });
});

describe("a handoff belongs to its account (finding 7)", () => {
  it("clears the old account's question when the account changes", async () => {
    const xs = accountStore(xData);
    const ys = accountStore(yData);
    ys.holdLoads();
    const { gw, el } = await setup({ x: xs, y: ys });

    await gw.emit(X);
    expect(text(el)).toContain("x@example.com already has saved data");
    await gw.emit(null);
    await gw.emit(Y); // users/y is still loading

    expect(text(el)).not.toContain("already has saved data");
    expect(maybeButton(el, "Keep your account's data")).toBeUndefined();
  });

  it("answers the new account's own question, and installs that account", async () => {
    const xs = accountStore(xData);
    const ys = accountStore(yData);
    ys.holdLoads();
    const { gw, el } = await setup({ x: xs, y: ys });

    await gw.emit(X);
    await gw.emit(null);
    await gw.emit(Y);
    ys.releaseLoads();
    await flush();

    expect(text(el)).toContain("y@example.com already has saved data");
    await click(button(el, "Keep your account's data"));
    expect(text(el)).toContain("Signed in as y@example.com");
    expect(field(el, "Weekly hours").value).toBe("24");
  });

  it("drops a handoff that finishes after the account changed", async () => {
    const xs = accountStore(xData);
    xs.holdLoads();
    const ys = accountStore(null);
    const { gw, el } = await setup({ x: xs, y: ys }, null);

    await gw.emit(X); // users/x is slow
    await gw.emit(Y);
    expect(text(el)).toContain("Signed in as y@example.com");

    xs.releaseLoads();
    await flush();
    expect(text(el)).toContain("Signed in as y@example.com");
    expect(text(el)).not.toContain("x@example.com");
  });
});
