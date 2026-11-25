/**
 * The account's store, `users/{uid}`, used from several devices at once and
 * offline, against the emulator. Offline is `disableNetwork`: writes queue on
 * the device and never settle until it's back online, as in the browser.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { disableNetwork, doc, enableNetwork, getDoc, setDoc, waitForPendingWrites } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { emptyAppData, NewerDataError } from "../src/storage";
import { FirestoreDataStore } from "../src/storage/firestoreDataStore";
import type { AppData, StoreState } from "../src/storage";
import { sam } from "../src/engine/fixtures";
import { device, eventually, rulesEnvironment, within } from "./emulator";
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
const open = (uid = UID) => {
  const d = device(uid);
  opened.push(d);
  return d;
};

/** The account document as the server has it, bypassing rules. */
async function serverCopy(uid = UID): Promise<Record<string, unknown> | undefined> {
  let data: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (admin) => {
    const snap = await getDoc(doc(admin.firestore() as unknown as Firestore, "users", uid));
    data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
  });
  return data;
}

async function seedServer(document: Record<string, unknown>, uid = UID) {
  await env.withSecurityRulesDisabled(async (admin) => {
    await setDoc(doc(admin.firestore() as unknown as Firestore, "users", uid), document);
  });
}

const base: AppData = {
  ...emptyAppData(),
  settings: { ...sam, sapVacationHours: 40, sapAsOf: "2025-11-24" },
};
const trip = { id: "trip", name: "Made-up trip", start: "2026-12-21", end: "2026-12-23", dayTypes: {} };
const visit = { id: "visit", name: "Made-up visit", start: "2027-02-01", end: "2027-02-02", dayTypes: {} };
const withHours = (data: AppData, weeklyHours: number): AppData => ({
  ...data,
  settings: { ...data.settings, weeklyHours },
});

/** Saves through `d` and waits until the server has it, so other devices can load it. */
async function seed(d: Device, data: AppData) {
  await d.store.save(data);
  await waitForPendingWrites(d.db);
}

describe("two devices on one account", () => {
  it("a device that kept the copy it loaded doesn't wipe the other device's new Occasion", async () => {
    // The verifier's repro: the Mac's page stays visible, the iPhone adds an Occasion.
    const mac = open();
    const phone = open();
    await seed(mac, base);
    const macCopy = (await mac.store.load())!;

    const phoneCopy = (await phone.store.load())!;
    await phone.store.update(phoneCopy, { ...phoneCopy, occasions: [trip] });
    await waitForPendingWrites(phone.db);

    await mac.store.update(macCopy, withHours(macCopy, 32));
    await waitForPendingWrites(mac.db);

    const final = (await open().store.load())!;
    expect(final.settings.weeklyHours).toBe(32);
    expect(final.occasions).toEqual([trip]);
  });

  it("two devices adding different Occasions both keep them", async () => {
    const mac = open();
    const phone = open();
    await seed(mac, base);
    const copy = (await mac.store.load())!;
    await phone.store.load();

    await mac.store.update(copy, { ...copy, occasions: [trip] });
    await phone.store.update(copy, { ...copy, occasions: [visit] });
    await Promise.all([waitForPendingWrites(mac.db), waitForPendingWrites(phone.db)]);

    const final = (await open().store.load())!;
    expect(final.occasions.map((o) => o.id).sort()).toEqual(["trip", "visit"]);
  });

  it("edits made offline on both devices all survive once they're back online", async () => {
    const mac = open();
    const phone = open();
    await seed(mac, { ...base, earnDateEdits: { "vacation:2026:3": "2026-04-06" } });
    const copy = (await mac.store.load())!;
    await phone.store.load();
    await disableNetwork(mac.db);
    await disableNetwork(phone.db);

    // Offline writes land on the device straight away; they don't wait for the server.
    expect(await within(mac.store.update(copy, { ...copy, occasions: [trip] }), 2000)).toBeUndefined();
    expect(await within(phone.store.update(copy, withHours({ ...copy, earnDateEdits: {} }, 30)), 2000)).toBeUndefined();

    await enableNetwork(mac.db);
    await enableNetwork(phone.db);
    await Promise.all([waitForPendingWrites(mac.db), waitForPendingWrites(phone.db)]);

    const final = (await open().store.load())!;
    expect(final.occasions).toEqual([trip]);
    expect(final.settings.weeklyHours).toBe(30);
    expect(final.earnDateEdits).toEqual({});
  });

  it("an Occasion edited on both devices ends up as one device's version, never a mix", async () => {
    const mac = open();
    const phone = open();
    await seed(mac, { ...base, occasions: [trip] });
    const copy = (await mac.store.load())!;
    await phone.store.load();

    const renamed = { ...trip, name: "Renamed on the Mac" };
    const retyped = { ...trip, dayTypes: { "2026-12-21": "unpaid" as const } };
    await mac.store.update(copy, { ...copy, occasions: [renamed] });
    await waitForPendingWrites(mac.db);
    await phone.store.update(copy, { ...copy, occasions: [retyped] });
    await waitForPendingWrites(phone.db);

    expect((await open().store.load())!.occasions).toEqual([retyped]);
  });

  it("each device sees the other's edits as they happen", async () => {
    const mac = open();
    const phone = open();
    await seed(mac, base);
    const seen: StoreState[] = [];
    const errors: Error[] = [];
    const stop = mac.store.subscribe(
      (s) => seen.push(s),
      (e) => errors.push(e),
    );
    try {
      const copy = (await phone.store.load())!;
      await phone.store.update(copy, { ...copy, occasions: [visit] });
      await eventually(() => seen.at(-1)?.data?.occasions[0]?.id === "visit");
      expect(errors).toEqual([]);
    } finally {
      stop();
    }
  });
});

describe("a device's copy is never written whole over the account (review findings)", () => {
  it("a device that hadn't seen the new document adds its Occasion without resetting Settings", async () => {
    const mac = open();
    const phone = open();
    expect(await mac.store.load()).toBeNull();
    expect(await phone.store.load()).toBeNull();
    await disableNetwork(phone.db);

    await mac.store.update(emptyAppData(), base);
    await waitForPendingWrites(mac.db);
    await phone.store.update(emptyAppData(), { ...emptyAppData(), occasions: [visit] });
    await enableNetwork(phone.db);
    await within(phone.store.synced(), 5000);

    const final = (await open().store.load())!;
    expect(final.settings).toEqual(base.settings);
    expect(final.occasions).toEqual([visit]);
  });

  it("a device offline with a version 1 copy keeps what others changed after them", async () => {
    await seedServer({ version: 1, data: { settings: base.settings, occasions: [trip], earnDateEdits: {} } });
    const mac = open();
    const phone = open();
    const macCopy = (await mac.store.load())!;
    const phoneCopy = (await phone.store.load())!;
    await disableNetwork(phone.db);

    const withVisit = { ...macCopy, occasions: [...macCopy.occasions, visit] };
    await mac.store.update(macCopy, withVisit);
    await mac.store.update(withVisit, withHours(withVisit, 32));
    await waitForPendingWrites(mac.db);
    await phone.store.update(phoneCopy, { ...phoneCopy, earnDateEdits: { "vacation:2026:3": "2026-04-06" } });
    await enableNetwork(phone.db);
    await within(phone.store.synced(), 5000);

    const final = (await open().store.load())!;
    expect(final.occasions.map((o) => o.id).sort()).toEqual(["trip", "visit"]);
    expect(final.settings.weeklyHours).toBe(32);
    expect(final.earnDateEdits).toEqual({ "vacation:2026:3": "2026-04-06" });
  });

  it("a device offline with a version 1 copy doesn't bring back data deleted elsewhere", async () => {
    await seedServer({ version: 1, data: { settings: base.settings, occasions: [trip, visit], earnDateEdits: {} } });
    const mac = open();
    const phone = open();
    await mac.store.load();
    const phoneCopy = (await phone.store.load())!;
    await disableNetwork(phone.db);

    await mac.store.clear();
    await waitForPendingWrites(mac.db);
    await phone.store.update(phoneCopy, withHours(phoneCopy, 36));
    await enableNetwork(phone.db);
    await expect(within(phone.store.synced(), 5000)).rejects.toThrow();

    expect(await serverCopy()).toBeUndefined();
  });
});

describe("version 1 documents (Occasions as a list)", () => {
  const v1 = {
    version: 1,
    data: { settings: base.settings, occasions: [trip, visit], earnDateEdits: { "vacation:2026:3": "2026-04-06" } },
  };

  it("load as before", async () => {
    await seedServer(v1);
    const loaded = (await open().store.load())!;
    expect(loaded.occasions).toEqual([trip, visit]);
    expect(loaded.earnDateEdits).toEqual({ "vacation:2026:3": "2026-04-06" });
  });

  it("move to version 2 on the first edit, keeping everything, and the list as it was", async () => {
    await seedServer(v1);
    const mac = open();
    const copy = (await mac.store.load())!;
    await mac.store.update(copy, withHours(copy, 36));
    await waitForPendingWrites(mac.db);

    const server = await serverCopy();
    expect(server?.version).toBe(2);
    expect((server!.data as { occasions: unknown }).occasions).toEqual([trip, visit]);
    const reloaded = (await open().store.load())!;
    expect(reloaded.settings.weeklyHours).toBe(36);
    expect(reloaded.occasions.map((o) => o.id).sort()).toEqual(["trip", "visit"]);
    expect(reloaded.earnDateEdits).toEqual({ "vacation:2026:3": "2026-04-06" });
  });

  it("two quick edits on a version 1 document both stick", async () => {
    await seedServer(v1);
    const mac = open();
    const copy = (await mac.store.load())!;
    const first = { ...copy, occasions: copy.occasions.filter((o) => o.id !== "visit") };
    await mac.store.update(copy, first);
    await mac.store.update(first, withHours(first, 24));
    await waitForPendingWrites(mac.db);

    const final = (await open().store.load())!;
    expect(final.occasions.map((o) => o.id)).toEqual(["trip"]);
    expect(final.settings.weeklyHours).toBe(24);
  });
});

describe("a document saved by a newer version of the app", () => {
  const v3 = { version: 3, data: { settings: base.settings, somethingNew: true } };

  it("won't load as if it were this version's", async () => {
    await seedServer(v3);
    await expect(open().store.load()).rejects.toBeInstanceOf(NewerDataError);
  });

  it("is never overwritten", async () => {
    await seedServer(v3);
    const mac = open();
    await mac.store.load().catch(() => {});
    await expect(mac.store.update(base, withHours(base, 20))).rejects.toBeInstanceOf(NewerDataError);
    await expect(mac.store.save(base)).rejects.toBeInstanceOf(NewerDataError);
    expect(await serverCopy()).toEqual(v3);
  });
});

describe("offline", () => {
  it("a save lands on the device without waiting for the server, and reaches the account later", async () => {
    const phone = open();
    await phone.store.load();
    await disableNetwork(phone.db);
    expect(await within(phone.store.save(base), 2000)).toBeUndefined();
    expect(await serverCopy()).toBeUndefined();

    await enableNetwork(phone.db);
    await waitForPendingWrites(phone.db);
    expect((await open().store.load())!.settings).toEqual(base.settings);
  });

  it("Delete lands on the device at once, and an edit made while it's pending can't bring the data back", async () => {
    const phone = open();
    await phone.store.save({ ...base, occasions: [trip] });
    await waitForPendingWrites(phone.db);
    const copy = (await phone.store.load())!;
    await disableNetwork(phone.db);

    expect(await within(phone.store.clear(), 2000)).toBeUndefined();
    await expect(phone.store.update(copy, withHours(copy, 36))).rejects.toThrow();
    await expect(phone.store.save(copy)).rejects.toThrow();

    await enableNetwork(phone.db);
    await within(phone.store.synced(), 5000);
    expect(await serverCopy()).toBeUndefined();
  });

  it("a device that was offline while the data was deleted elsewhere doesn't bring it back", async () => {
    const mac = open();
    const phone = open();
    await seed(mac, { ...base, occasions: [trip] });
    const copy = (await phone.store.load())!;
    await disableNetwork(phone.db);

    await mac.store.clear();
    await waitForPendingWrites(mac.db);
    await phone.store.update(copy, withHours(copy, 36)); // queued on the phone
    await enableNetwork(phone.db);
    await expect(within(phone.store.synced(), 5000)).rejects.toThrow();

    expect(await serverCopy()).toBeUndefined();
  });

  it("says so when another tab's sign-out shuts this tab's Firestore client down", async () => {
    const phone = open();
    const onClientLost = vi.fn();
    const store = new FirestoreDataStore(doc(phone.db, "users", UID), { onClientLost });
    const stop = store.subscribe(
      () => {},
      () => {},
    );
    await store.load();
    // What the SDK does in this tab when another tab clears the offline cache:
    // it shuts the client down without marking the Firestore instance terminated.
    await (phone.db as unknown as { _firestoreClient: { terminate(): Promise<void> } })._firestoreClient.terminate();
    await eventually(() => onClientLost.mock.calls.length > 0);
    stop();
  });

  it("synced() waits until the server has this store's writes", async () => {
    const phone = open();
    await phone.store.load();
    await disableNetwork(phone.db);
    await phone.store.save(base);
    expect(await within(phone.store.synced(), 500)).toBe("pending");
    await enableNetwork(phone.db);
    await expect(within(phone.store.synced(), 5000)).resolves.toBeUndefined();
  });
});
