import { describe, expect, it, vi } from "vitest";
import { deleteMyData, handOffOnSignIn, signOut } from "./sync";
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

describe("signOut", () => {
  it("signs out and clears the device copy", async () => {
    const device = memoryStore(deviceData);
    const account = memoryStore(accountData);
    const session = { signOut: vi.fn(async () => {}) };

    await signOut({ device, session });

    expect(session.signOut).toHaveBeenCalledOnce();
    expect(await device.load()).toBeNull();
    expect(await account.load()).toEqual(accountData);
  });
});

describe("deleteMyData", () => {
  it("removes the account's copy and the device copy, then signs out", async () => {
    const device = memoryStore(deviceData);
    const account = memoryStore(accountData);
    const session = { signOut: vi.fn(async () => {}) };

    await deleteMyData({ device, account, session });

    expect(await account.load()).toBeNull();
    expect(await device.load()).toBeNull();
    expect(session.signOut).toHaveBeenCalledOnce();
  });

  it("clears the device copy when signed out", async () => {
    const device = memoryStore(deviceData);
    await deleteMyData({ device, account: null, session: null });
    expect(await device.load()).toBeNull();
  });

  it("keeps the device copy if the account's copy can't be deleted", async () => {
    const device = memoryStore(deviceData);
    const account = {
      ...memoryStore(accountData),
      clear: async () => {
        throw new Error("offline");
      },
    };
    const session = { signOut: vi.fn(async () => {}) };

    await expect(deleteMyData({ device, account, session })).rejects.toThrow("offline");
    expect(await device.load()).toEqual(deviceData);
    expect(session.signOut).not.toHaveBeenCalled();
  });
});
