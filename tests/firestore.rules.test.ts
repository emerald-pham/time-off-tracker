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
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
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
