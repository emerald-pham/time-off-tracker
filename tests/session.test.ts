/**
 * Sign-out, "Delete my data" and the first-sign-in handoff with the real
 * account store, against the emulator. Offline is `disableNetwork`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { disableNetwork, doc, enableNetwork, getDoc, waitForPendingWrites } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { writesSyncedWithin } from "../src/auth/pendingWrites";
import { deleteMyData, handOffOnSignIn, signOut, UnsyncedChangesError } from "../src/auth/sync";
import { emptyAppData, LocalDataStore, memoryStorage } from "../src/storage";
import type { AppData } from "../src/storage";
import { sam } from "../src/engine/fixtures";
import { device, rulesEnvironment, within } from "./emulator";
import type { Device } from "./emulator";

let env: RulesTestEnvironment;
const opened: Device[] = [];

beforeAll(async () => {
  env = await rulesEnvironment();
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterEach(async () => {
  while (opened.length) await opened.pop()!.close();
});

const UID = "made-up-user";
const open = () => {
  const d = device(UID);
  opened.push(d);
  return d;
};

async function serverHasDocument(): Promise<boolean> {
  let exists = false;
  await env.withSecurityRulesDisabled(async (admin) => {
    exists = (await getDoc(doc(admin.firestore() as unknown as Firestore, "users", UID))).exists();
  });
  return exists;
}

const deviceData: AppData = {
  ...emptyAppData(),
  settings: { ...sam, sapVacationHours: 40, sapAsOf: "2026-11-01" },
  occasions: [{ id: "trip", name: "Made-up trip", start: "2026-12-21", end: "2026-12-24", dayTypes: {} }],
};
const accountData: AppData = { ...deviceData, settings: { ...deviceData.settings, weeklyHours: 32 }, occasions: [] };

/** The gateway's session, minus Firebase Auth and the page reload. */
function sessionFor(d: Device) {
  return { changesSynced: () => writesSyncedWithin(d.db, 300), signOut: vi.fn(async () => {}) };
}

describe("writesSyncedWithin", () => {
  it("is true at once with nothing waiting", async () => {
    const phone = open();
    await phone.store.load();
    expect(await writesSyncedWithin(phone.db, 300)).toBe(true);
  });

  it("is false while a change waits offline, and true once it's sent", async () => {
    const phone = open();
    await phone.store.load();
    await disableNetwork(phone.db);
    await phone.store.save(deviceData);
    expect(await writesSyncedWithin(phone.db, 300)).toBe(false);
    await enableNetwork(phone.db);
    expect(await writesSyncedWithin(phone.db, 5000)).toBe(true);
  });
});

describe("signing out with a change still offline", () => {
  it("is refused, and the change still reaches the account later", async () => {
    const phone = open();
    await phone.store.load();
    await disableNetwork(phone.db);
    await phone.store.save(deviceData);
    const session = sessionFor(phone);

    await expect(signOut({ device: new LocalDataStore(memoryStorage()), session })).rejects.toBeInstanceOf(
      UnsyncedChangesError,
    );
    expect(session.signOut).not.toHaveBeenCalled();

    await enableNetwork(phone.db);
    await waitForPendingWrites(phone.db);
    expect(await serverHasDocument()).toBe(true);
  });
});

describe("Delete my data needs the server", () => {
  it("offline, refuses, deletes nothing, and leaves no delete waiting to run later", async () => {
    const phone = open();
    await phone.store.save(accountData);
    await waitForPendingWrites(phone.db);
    await phone.store.load();
    const local = new LocalDataStore(memoryStorage());
    await local.save(deviceData);
    await disableNetwork(phone.db);
    const session = sessionFor(phone);

    await expect(deleteMyData({ device: local, account: phone.store, session })).rejects.toThrow(
      "You need to be online to delete your data",
    );
    expect(await local.load()).toEqual(deviceData);
    expect(session.signOut).not.toHaveBeenCalled();

    // Back online, nothing queued runs: the account keeps its data.
    await enableNetwork(phone.db);
    await waitForPendingWrites(phone.db);
    expect(await serverHasDocument()).toBe(true);
  });

  it("online, deletes the account's copy on the server, then signs out", async () => {
    const phone = open();
    await phone.store.save(accountData);
    await waitForPendingWrites(phone.db);
    await phone.store.load();
    const session = sessionFor(phone);

    await deleteMyData({ device: new LocalDataStore(memoryStorage()), account: phone.store, session });

    expect(await serverHasDocument()).toBe(false);
    expect(session.signOut).toHaveBeenCalledOnce();
  });
});

describe("the first-sign-in handoff, when the connection drops", () => {
  it("doesn't wait for the server once the person has answered", async () => {
    const phone = open();
    await phone.store.save(accountData);
    await waitForPendingWrites(phone.db);
    const local = new LocalDataStore(memoryStorage());
    await local.save(deviceData);

    const handoff = handOffOnSignIn({
      device: local,
      account: phone.store,
      ask: async () => {
        await disableNetwork(phone.db); // the question was up; the network went
        return "replace-with-device";
      },
    });

    expect(await within(handoff, 2000)).toEqual(deviceData);
    expect(await local.load()).toBeNull();

    await enableNetwork(phone.db);
    await waitForPendingWrites(phone.db);
    expect((await open().store.load())?.settings.weeklyHours).toBe(40);
  });
});
