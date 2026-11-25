import { deleteDoc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { DocumentReference } from "firebase/firestore";
import { withDefaults } from "./dataStore";
import type { AppData, DataStore } from "./dataStore";

const VERSION = 1;

/** The stored shape of `users/{uid}`. firestore.rules allows only these fields. */
interface UserDocument {
  version: number;
  data: Partial<AppData>;
  updatedAt?: unknown;
}

/**
 * Keeps AppData in the signed-in account's one Firestore document,
 * `users/{uid}`. With offline persistence on, saves land in the device's cache
 * first and sync when online.
 */
export class FirestoreDataStore implements DataStore {
  constructor(private readonly ref: DocumentReference) {}

  async load(): Promise<AppData | null> {
    const snap = await getDoc(this.ref);
    if (!snap.exists()) return null;
    return withDefaults((snap.data() as UserDocument).data ?? {});
  }

  async save(data: AppData): Promise<void> {
    const document: UserDocument = { version: VERSION, data, updatedAt: serverTimestamp() };
    await setDoc(this.ref, document);
  }

  async clear(): Promise<void> {
    await deleteDoc(this.ref);
  }
}
