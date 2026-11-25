/**
 * Helpers for tests that run against the Firestore emulator on the
 * `demo-time-off-tracker` project (`npm run test:rules`), never a real one.
 */
import { readFileSync } from "node:fs";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  terminate,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { FirestoreDataStore } from "../src/storage/firestoreDataStore";

export const PROJECT_ID = "demo-time-off-tracker";

function emulatorAddress(): { host: string; port: number } {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
  return { host, port: Number(port) };
}

/** A test environment with this repo's firestore.rules loaded. */
export function rulesEnvironment(): Promise<RulesTestEnvironment> {
  const { host, port } = emulatorAddress();
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host, port, rules: readFileSync("firestore.rules", "utf8") },
  });
}

export interface Device {
  db: Firestore;
  /** The signed-in account's store, `users/{uid}`, as the app builds it. */
  store: FirestoreDataStore;
  close(): Promise<void>;
}

let devices = 0;

/**
 * One device signed in as `uid`, with its own Firestore client. Node has no
 * IndexedDB, so the client keeps its cache in memory, but it queues offline
 * writes the same way. Take a device offline with `disableNetwork(device.db)`.
 */
export function device(uid: string): Device {
  const name = `device-${++devices}`;
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "demo-key", appId: `demo-${name}` }, name);
  const db = initializeFirestore(app, {});
  const { host, port } = emulatorAddress();
  connectFirestoreEmulator(db, host, port, { mockUserToken: { sub: uid, user_id: uid } });
  return {
    db,
    store: new FirestoreDataStore(doc(db, "users", uid)),
    async close() {
      await terminate(db);
      await deleteApp(app);
    },
  };
}

/** Resolves with "pending" if `promise` hasn't settled within `ms`. */
export async function within<T>(promise: Promise<T>, ms: number): Promise<T | "pending"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"pending">((resolve) => {
    timer = setTimeout(() => resolve("pending"), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Polls `check` until it returns true, or fails after `ms`. */
export async function eventually(check: () => boolean | Promise<boolean>, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
