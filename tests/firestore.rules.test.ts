/**
 * Firestore security rules and FirestoreDataStore, against the emulator.
 * Run with `npm run test:rules`, which starts the emulator on a `demo-`
 * project, so nothing here touches a real Firebase project.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { RulesTestContext, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { FirestoreDataStore } from "../src/storage/firestoreDataStore";
import type { AppData } from "../src/storage";
import { sam } from "../src/engine/fixtures";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-time-off-tracker",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

/** The modular SDK accepts the test context's Firestore instance. */
const db = (context: RulesTestContext) => context.firestore() as unknown as Firestore;
const storeFor = (context: RulesTestContext, uid: string) =>
  new FirestoreDataStore(doc(db(context), "users", uid));

const samData: AppData = {
  settings: { ...sam, sapVacationHours: 40, sapAsOf: "2025-11-24" },
  occasions: [
    {
      id: "o1",
      name: "Made-up beach week",
      start: "2026-06-01",
      end: "2026-06-05",
      dayTypes: { "2026-06-01": "vacation" },
    },
  ],
  earnDateEdits: { "vacation:2026:3": "2026-04-06" },
};

describe("FirestoreDataStore", () => {
  it("loads nothing for a new account", async () => {
    const alice = env.authenticatedContext("alice");
    expect(await storeFor(alice, "alice").load()).toBeNull();
  });

  it("loads what it saved at users/{uid}", async () => {
    const alice = env.authenticatedContext("alice");
    await storeFor(alice, "alice").save(samData);
    expect(await storeFor(alice, "alice").load()).toEqual(samData);
  });

  it("removes the document on clear (Delete my data)", async () => {
    const alice = env.authenticatedContext("alice");
    const store = storeFor(alice, "alice");
    await store.save(samData);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

describe("firestore.rules", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(db(admin), "users", "alice"), { version: 1, data: samData });
    });
  });

  it("lets the owner read, write and delete users/{uid}", async () => {
    const alice = db(env.authenticatedContext("alice"));
    await assertSucceeds(getDoc(doc(alice, "users", "alice")));
    await assertSucceeds(setDoc(doc(alice, "users", "alice"), { version: 1, data: samData }));
    await assertSucceeds(deleteDoc(doc(alice, "users", "alice")));
  });

  it("stops a second account reading or changing the first account's document", async () => {
    const bob = db(env.authenticatedContext("bob"));
    await assertFails(getDoc(doc(bob, "users", "alice")));
    await assertFails(setDoc(doc(bob, "users", "alice"), { version: 1, data: samData }));
    await assertFails(deleteDoc(doc(bob, "users", "alice")));
  });

  it("stops anyone signed out", async () => {
    const anon = db(env.unauthenticatedContext());
    await assertFails(getDoc(doc(anon, "users", "alice")));
    await assertFails(setDoc(doc(anon, "users", "alice"), { version: 1, data: samData }));
  });

  it("doesn't let anyone list the users collection", async () => {
    const alice = db(env.authenticatedContext("alice"));
    await assertFails(getDocs(collection(alice, "users")));
  });

  it("refuses fields other than version, data and updatedAt", async () => {
    const alice = db(env.authenticatedContext("alice"));
    await assertFails(
      setDoc(doc(alice, "users", "alice"), { version: 1, data: samData, extra: "x" }),
    );
  });

  it("denies everything outside users/{uid}", async () => {
    const alice = db(env.authenticatedContext("alice"));
    await assertFails(getDoc(doc(alice, "other", "alice")));
    await assertFails(setDoc(doc(alice, "users", "alice", "sub", "x"), { a: 1 }));
  });
});

describe("firestore.rules, version 2 documents (ADR 0003)", () => {
  const v2 = {
    version: 2,
    data: {
      settings: samData.settings,
      occasionsById: { o1: samData.occasions[0] },
      earnDateEdits: samData.earnDateEdits,
    },
  };
  const aliceDoc = () => doc(db(env.authenticatedContext("alice")), "users", "alice");

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(db(admin), "users", "alice"), v2);
    });
  });

  it("lets the owner write the whole document, or one entry at a time", async () => {
    await assertSucceeds(setDoc(aliceDoc(), v2));
    await assertSucceeds(
      updateDoc(aliceDoc(), new FieldPath("data", "occasionsById", "o2"), { ...samData.occasions[0], id: "o2" }),
    );
    // A deleted Occasion stays as null, so a version 1 list can't bring it back.
    await assertSucceeds(updateDoc(aliceDoc(), new FieldPath("data", "occasionsById", "o1"), null));
    await assertSucceeds(updateDoc(aliceDoc(), new FieldPath("data", "earnDateEdits", "vacation:2026:3"), deleteField()));
  });

  it("lets a new document start with just the entries one edit wrote", async () => {
    await env.clearFirestore();
    await assertSucceeds(
      setDoc(aliceDoc(), { version: 2, data: { occasionsById: { o1: samData.occasions[0] } } }),
    );
  });

  it("won't let an older app create a version 1 document any more", async () => {
    await env.clearFirestore();
    await assertFails(setDoc(aliceDoc(), { version: 1, data: samData }));
  });

  it("stops an older app writing version 1 over it", async () => {
    await assertFails(setDoc(aliceDoc(), { version: 1, data: samData }));
  });

  it("refuses fields it doesn't know under data or settings", async () => {
    await assertFails(updateDoc(aliceDoc(), new FieldPath("data", "extra"), 1));
    await assertFails(updateDoc(aliceDoc(), new FieldPath("data", "settings", "extra"), 1));
  });

  it("keeps each part the right shape: maps, and version 1's Occasion list a list", async () => {
    await assertFails(updateDoc(aliceDoc(), new FieldPath("data", "occasionsById"), "none"));
    await assertFails(updateDoc(aliceDoc(), new FieldPath("data", "occasions"), { o1: samData.occasions[0] }));
    await assertFails(updateDoc(aliceDoc(), new FieldPath("data", "earnDateEdits"), "none"));
    await assertFails(updateDoc(aliceDoc(), new FieldPath("data", "settings"), "none"));
  });

  it("US-23: accepts an Occasion with its approval status, written on its own", async () => {
    const occasion = { ...samData.occasions[0], approved: true };
    await assertSucceeds(updateDoc(aliceDoc(), new FieldPath("data", "occasionsById", "o1"), occasion));
    await assertSucceeds(setDoc(aliceDoc(), { ...v2, data: { ...v2.data, occasionsById: { o1: occasion } } }));
  });

  it("needs a whole-number version", async () => {
    await assertFails(setDoc(aliceDoc(), { ...v2, version: "2" }));
    await assertFails(setDoc(aliceDoc(), { data: v2.data }));
  });
});
