import { describe, expect, it, vi } from "vitest";
import { deleteMyData, handOffOnSignIn, signOut, UnsyncedChangesError } from "./sync";
import type { HandoffChoice } from "./sync";
import { emptyAppData, LocalDataStore, memoryStorage } from "../storage";
import type { AppData, DataStore } from "../storage";
import { sam } from "../engine/fixtures";

/** An in-memory DataStore standing in for local storage or Firestore, counting full saves. */
function memoryStore(initial: AppData | null = null): DataStore & { saves: number } {
  const inner = new LocalDataStore(memoryStorage());
  if (initial !== null) void inner.save(initial);
  const store = {
    saves: 0,
    load: () => inner.load(),
    save: async (data: AppData) => {
      store.saves++;
      await inner.save(data);
    },
    update: (before: AppData, after: AppData) => inner.update(before, after),
    clear: () => inner.clear(),
    synced: () => inner.synced(),
    subscribe: inner.subscribe.bind(inner),
  };
  return store;
}

const deviceData: AppData = {
  settings: { ...sam, sapVacationHours: 40, sapAsOf: "2025-11-24" },
  occasions: [],
  earnDateEdits: {},
};

const accountData: AppData = {
  settings: { ...sam, weeklyHours: 32, sapVacationHours: 16, sapAsOf: "2025-10-01" },
  occasions: [],
  earnDateEdits: {},
};

describe("handOffOnSignIn", () => {
  it("moves the device's data up when the account is empty, without asking", async () => {
    const device = memoryStore(deviceData);
    const account = memoryStore();
    const ask = vi.fn();

    const data = await handOffOnSignIn({ device, account, ask });

    expect(data).toEqual(deviceData);
    expect(await account.load()).toEqual(deviceData);
    expect(await device.load()).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });

  it("moves the device's data up without asking when the account holds only defaults", async () => {
    // Another device signed in fresh, ticked a weekday on and off, and so saved the defaults.
    const device = memoryStore(deviceData);
    const account = memoryStore(emptyAppData());
    const ask = vi.fn();

    const data = await handOffOnSignIn({ device, account, ask });

    expect(ask).not.toHaveBeenCalled();
    expect(data).toEqual(deviceData);
    expect(await account.load()).toEqual(deviceData);
    expect(await device.load()).toBeNull();
  });

  it("asks when the account already has data, and can keep the account's data", async () => {
    const device = memoryStore(deviceData);
    const account = memoryStore(accountData);
    const ask = vi.fn(async () => "keep-account" as const);

    const data = await handOffOnSignIn({ device, account, ask });

    expect(ask).toHaveBeenCalledOnce();
    expect(data).toEqual(accountData);
    expect(await account.load()).toEqual(accountData);
    expect(await device.load()).toBeNull();
  });

  it("can replace the account's data with this device's, never merging", async () => {
    const device = memoryStore(deviceData);
    const account = memoryStore(accountData);

    const data = await handOffOnSignIn({
      device,
      account,
      ask: async () => "replace-with-device",
    });

    expect(data).toEqual(deviceData);
    expect(await account.load()).toEqual(deviceData);
    expect(await device.load()).toBeNull();
  });

  it("a second tab's late answer doesn't replace the account again after the first tab finished", async () => {
    // Both tabs saw the sign-in and asked; the device copy is shared between them.
    const device = memoryStore(deviceData);
    const account = memoryStore(accountData);
    let answerInTab2!: (choice: HandoffChoice) => void;
    const tab2 = handOffOnSignIn({ device, account, ask: () => new Promise((resolve) => (answerInTab2 = resolve)) });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await handOffOnSignIn({ device, account, ask: async () => "replace-with-device" });
    const editedInTab1 = { ...deviceData, settings: { ...deviceData.settings, weeklyHours: 20 } };
    await account.update(deviceData, editedInTab1);
    answerInTab2("replace-with-device");

    expect(await tab2).toEqual(editedInTab1);
    expect(await account.load()).toEqual(editedInTab1);
  });

  it("asks only once: the next sign-in on this device just uses the account", async () => {
    const device = memoryStore(deviceData);
    const account = memoryStore(accountData);
    const ask = vi.fn(async () => "replace-with-device" as const);

    await handOffOnSignIn({ device, account, ask });
    const data = await handOffOnSignIn({ device, account, ask });

    expect(ask).toHaveBeenCalledOnce();
    expect(data).toEqual(deviceData);
  });

  it("uses the account's data without asking when this device has nothing saved", async () => {
    const account = memoryStore(accountData);
    const ask = vi.fn();

    const data = await handOffOnSignIn({ device: memoryStore(), account, ask });

    expect(data).toEqual(accountData);
    expect(ask).not.toHaveBeenCalled();
    expect(account.saves).toBe(0);
  });

  it("treats a device copy that was never filled in as nothing saved", async () => {
    const device = memoryStore(emptyAppData());
    const account = memoryStore(accountData);
    const ask = vi.fn();

    const data = await handOffOnSignIn({ device, account, ask });

    expect(data).toEqual(accountData);
    expect(ask).not.toHaveBeenCalled();
    expect(await account.load()).toEqual(accountData);
    expect(await device.load()).toBeNull();
  });

  it("doesn't ask when this device and the account already hold the same data", async () => {
    const ask = vi.fn();
    const data = await handOffOnSignIn({
      device: memoryStore(accountData),
      account: memoryStore(accountData),
      ask,
    });
    expect(data).toEqual(accountData);
    expect(ask).not.toHaveBeenCalled();
  });
});

/** A session whose changes have (or haven't yet) reached the account. */
function sessionWith(changesSynced: boolean) {
  return { changesSynced: vi.fn(async () => changesSynced), signOut: vi.fn(async () => {}) };
}

/**
 * The account's store while offline: writes land on the device, but the
 * server never answers, so `synced()` never settles until `goOnline()`.
 */
function offlineAccount(initial: AppData) {
  const store = memoryStore(initial);
  let answer!: { resolve: () => void; reject: (e: Error) => void };
  const synced = new Promise<void>((resolve, reject) => (answer = { resolve, reject }));
  return {
    ...store,
    synced: () => synced,
    goOnline: () => answer.resolve(),
    serverRefuses: (e: Error) => answer.reject(e),
  };
}

const settled = async (p: Promise<unknown>) => {
  let done = false;
  void p.then(
    () => (done = true),
    () => (done = true),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  return done;
};

describe("signOut", () => {
  it("signs out and clears the device copy once every change has reached the account", async () => {
    const device = memoryStore(deviceData);
    const account = memoryStore(accountData);
    const session = sessionWith(true);

    await signOut({ device, session });

    expect(session.signOut).toHaveBeenCalledOnce();
    expect(await device.load()).toBeNull();
    expect(await account.load()).toEqual(accountData);
  });

  it("refuses while changes haven't reached the account, and clears nothing", async () => {
    const device = memoryStore(deviceData);
    const session = sessionWith(false);

    await expect(signOut({ device, session })).rejects.toBeInstanceOf(UnsyncedChangesError);
    expect(session.signOut).not.toHaveBeenCalled();
    expect(await device.load()).toEqual(deviceData);
  });

  it("signs out anyway when the person chooses to discard unsynced changes", async () => {
    const device = memoryStore(deviceData);
    const session = sessionWith(false);

    await signOut({ device, session, discardUnsynced: true });

    expect(session.signOut).toHaveBeenCalledOnce();
    expect(await device.load()).toBeNull();
  });
});

describe("deleteMyData", () => {
  it("removes the account's copy and the device copy, then signs out", async () => {
    const device = memoryStore(deviceData);
    const account = memoryStore(accountData);
    const session = sessionWith(true);

    const { accountDeleted } = await deleteMyData({ device, account, session });
    await accountDeleted;

    expect(await account.load()).toBeNull();
    expect(await device.load()).toBeNull();
    expect(session.signOut).toHaveBeenCalledOnce();
  });

  it("clears the device copy when signed out", async () => {
    const device = memoryStore(deviceData);
    const { accountDeleted } = await deleteMyData({ device, account: null, session: null });
    await accountDeleted;
    expect(await device.load()).toBeNull();
  });

  it("offline, is done on this device at once, and signs out only when the server has the delete", async () => {
    const device = memoryStore(deviceData);
    const account = offlineAccount(accountData);
    const session = sessionWith(true);

    const { accountDeleted } = await deleteMyData({ device, account, session });

    expect(await device.load()).toBeNull();
    expect(await account.load()).toBeNull();
    expect(await settled(accountDeleted)).toBe(false);
    expect(session.signOut).not.toHaveBeenCalled();

    account.goOnline();
    await accountDeleted;
    expect(session.signOut).toHaveBeenCalledOnce();
  });

  it("doesn't sign out if the server refuses the delete", async () => {
    const account = offlineAccount(accountData);
    const session = sessionWith(true);

    const { accountDeleted } = await deleteMyData({ device: memoryStore(deviceData), account, session });
    account.serverRefuses(new Error("Missing or insufficient permissions."));

    await expect(accountDeleted).rejects.toThrow("permissions");
    expect(session.signOut).not.toHaveBeenCalled();
  });
});
