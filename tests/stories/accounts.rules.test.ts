/**
 * Acceptance tests for "Accounts and devices" in docs/user-stories.md (US-16
 * and US-17) that need the Firestore emulator. Run with `npm run test:rules`,
 * which uses the `demo-time-off-tracker` project, never a real one. "Sam" and
 * "Lee" are the spec's made-up cast members; the uids are made up too.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc, waitForPendingWrites } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { handOffOnSignIn } from "../../src/auth/sync";
import { computeView } from "../../src/engine";
import { LocalDataStore, memoryStorage } from "../../src/storage";
import type { AppData, StoreState } from "../../src/storage";
import { FirestoreDataStore } from "../../src/storage/firestoreDataStore";
import { device, eventually, rulesEnvironment } from "../emulator";
import type { Device } from "../emulator";
import { lee, occasion, samE2 } from "./helpers";

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

const SAM = "made-up-uid-sam";
const LEE = "made-up-uid-lee";

const signedIn = (uid: string) => {
  const d = device(uid);
  opened.push(d);
  return d;
};

const samData: AppData = {
  settings: samE2,
  occasions: [occasion("ski", "Made-up ski week", "2026-02-24", "2026-02-26")],
  earnDateEdits: {},
};
const leeData: AppData = {
  settings: { ...lee, sapVacationHours: 240, sapAsOf: "2026-01-10" },
  occasions: [occasion("beach", "Made-up beach trip", "2026-07-13", "2026-07-14")],
  earnDateEdits: {},
};

async function saveAndSync(d: Device, data: AppData) {
  await d.store.save(data);
  await waitForPendingWrites(d.db);
}

describe("US-16: Sign-in is optional and syncs", () => {
  it("US-16: signing in moves this device's data into the account, and my other devices load it", async () => {
    // Sam used the app signed out on the Mac first.
    const macLocal = new LocalDataStore(memoryStorage());
    await macLocal.save(samData);

    const mac = signedIn(SAM);
    const result = await handOffOnSignIn({
      device: macLocal,
      account: mac.store,
      ask: () => Promise.reject(new Error("an empty account asks nothing")),
    });
    expect(result).toEqual(samData);
    await waitForPendingWrites(mac.db);

    for (const other of [signedIn(SAM), signedIn(SAM)]) {
      const data = await other.store.load();
      expect(data).toEqual(samData);
      expect(computeView({ ...data!, today: "2025-11-24" }).occasions[0].name).toBe("Made-up ski week");
    }
  });

  it("US-16: an edit on the iPad shows up on the iPhone and the Mac", async () => {
    const [iphone, ipad, mac] = [signedIn(SAM), signedIn(SAM), signedIn(SAM)];
    await saveAndSync(mac, samData);

    const seen: Record<string, StoreState[]> = { iphone: [], mac: [] };
    const errors: Error[] = [];
    const stops = [
      iphone.store.subscribe((s) => seen.iphone.push(s), (e) => errors.push(e)),
      mac.store.subscribe((s) => seen.mac.push(s), (e) => errors.push(e)),
    ];
    try {
      const copy = (await ipad.store.load())!;
      const visit = occasion("visit", "Made-up family visit", "2026-04-06", "2026-04-07");
      await ipad.store.update(copy, { ...copy, occasions: [...copy.occasions, visit] });
      const hasVisit = (states: StoreState[]) =>
        states.at(-1)?.data?.occasions.some((o) => o.name === "Made-up family visit") === true;
      await eventually(() => hasVisit(seen.iphone) && hasVisit(seen.mac));
      expect(errors).toEqual([]);
    } finally {
      stops.forEach((stop) => stop());
    }
  });
});

describe("US-17: Coworkers can use it too, privately", () => {
  /** Firestore as an account sees it, with this repo's rules. */
  const asAccount = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

  it("US-17: each coworker signs in with their own account and sees only their own data", async () => {
    const samsPhone = signedIn(SAM);
    const leesPhone = signedIn(LEE);
    await saveAndSync(samsPhone, samData);
    await saveAndSync(leesPhone, leeData);

    expect(await samsPhone.store.load()).toEqual(samData);
    expect(await leesPhone.store.load()).toEqual(leeData);
  });

  it("US-17: a coworker's app can't load someone else's data", async () => {
    await saveAndSync(signedIn(SAM), samData);
    const leesPhone = signedIn(LEE);
    const samsDocument = new FirestoreDataStore(doc(leesPhone.db, "users", SAM));
    await expect(samsDocument.load()).rejects.toThrow();
  });

  it("US-17: nobody else can read, change or delete my data", async () => {
    await saveAndSync(signedIn(SAM), samData);
    const leeDb = asAccount(LEE);
    const sams = doc(leeDb, "users", SAM);
    await assertFails(getDoc(sams));
    await assertFails(setDoc(sams, { version: 2, data: {} }));
    await assertFails(updateDoc(sams, { "data.settings.weeklyHours": 20 }));
    await assertFails(deleteDoc(sams));
    // Signed out, nobody gets in either.
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(anon, "users", SAM)));
    // Sam still can.
    await assertSucceeds(getDoc(doc(asAccount(SAM), "users", SAM)));
  });
});
