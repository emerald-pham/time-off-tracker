import {
  deleteDoc,
  deleteField,
  FieldPath,
  getDoc,
  getDocFromCache,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { DocumentReference, DocumentSnapshot } from "firebase/firestore";
import {
  applyChanges,
  changesBetween,
  fromKeyedAppData,
  keyedAppData,
  NewerDataError,
  withDefaults,
} from "./dataStore";
import type { AppData, DataStore, KeyedAppData, StoreState } from "./dataStore";

/**
 * The shape of `users/{uid}` this version writes (ADR 0003). Version 1 kept
 * Occasions as a list, so any save rewrote the whole document; version 2 keys
 * them by id, so a save can write just the entries it changed.
 */
export const DOCUMENT_VERSION = 2;

/** The stored shape of `users/{uid}`. firestore.rules allows only these fields. */
interface UserDocument {
  version: number;
  data: KeyedAppData;
  updatedAt?: unknown;
}

/** What this store last saw of the document: from a load, a snapshot or its own write. */
interface Seen {
  exists: boolean;
  version: number;
  data: AppData | null;
}

/**
 * Keeps AppData in the signed-in account's one Firestore document,
 * `users/{uid}`. With offline persistence on, saves land in the device's cache
 * first and sync when online.
 *
 * - An edit writes only the settings, Occasions and Earn Date edits it
 *   changed (dotted-path updates), so edits other devices made meanwhile to
 *   anything else survive. A version 1 document is rewritten whole, once, in
 *   version 2 on its first edit.
 * - A document from a newer version of the app is never overwritten.
 * - Writes resolve once they're on this device, not when the server has them,
 *   which offline may be never. `synced()` waits for the server.
 * - After `clear()` ("Delete my data") the store refuses every save, so an
 *   edit made while the delete is still on its way can't bring the data back.
 */
export class FirestoreDataStore implements DataStore {
  private seen: Seen | null = null;
  private deleted = false;
  private lastWrite: Promise<void> = Promise.resolve();
  private readonly writeErrorListeners = new Set<(error: Error) => void>();

  constructor(private readonly ref: DocumentReference) {}

  async load(): Promise<AppData | null> {
    return this.note(await getDoc(this.ref));
  }

  async save(data: AppData): Promise<void> {
    this.checkWritable();
    await this.writeWhole(data);
  }

  async update(before: AppData, after: AppData): Promise<void> {
    this.checkWritable();
    const changes = changesBetween(before, after);
    if (changes.length === 0) return;
    const seen = this.seen;
    if (!seen?.exists || seen.version < DOCUMENT_VERSION) {
      // No document to patch yet (a new account, or deleted on another
      // device), or a version 1 document: write it whole, in this version's
      // shape, from the latest copy seen.
      await this.writeWhole(applyChanges(seen?.exists && seen.data ? seen.data : before, changes));
      return;
    }
    const fields: unknown[] = [];
    for (const { section, key, value } of changes) {
      fields.push(new FieldPath("data", section, key), value === undefined ? deleteField() : value);
    }
    this.seen = { ...seen, data: seen.data && applyChanges(seen.data, changes) };
    await this.commit(
      updateDoc(this.ref, new FieldPath("version"), DOCUMENT_VERSION, new FieldPath("updatedAt"), serverTimestamp(), ...fields),
    );
  }

  async clear(): Promise<void> {
    this.deleted = true;
    this.seen = { exists: false, version: 0, data: null };
    await this.commit(deleteDoc(this.ref));
  }

  /** Resolves once the server has every write made through this store; rejects if it refused the last one. */
  synced(): Promise<void> {
    return this.lastWrite;
  }

  subscribe(onChange: (state: StoreState) => void, onError: (error: Error) => void): () => void {
    this.writeErrorListeners.add(onError);
    const stop = onSnapshot(
      this.ref,
      { includeMetadataChanges: true },
      (snap) => {
        let data: AppData | null;
        try {
          data = this.note(snap);
        } catch (e) {
          onError(e instanceof Error ? e : new Error(String(e)));
          return;
        }
        onChange({ data, unsynced: snap.metadata.hasPendingWrites, notKept: false });
      },
      onError,
    );
    return () => {
      this.writeErrorListeners.delete(onError);
      stop();
    };
  }

  private checkWritable(): void {
    if (this.deleted) throw new Error("Your data is being deleted, so this change wasn't saved.");
    if (this.seen && this.seen.version > DOCUMENT_VERSION) throw new NewerDataError();
  }

  private async writeWhole(data: AppData): Promise<void> {
    const document: UserDocument = { version: DOCUMENT_VERSION, data: keyedAppData(data), updatedAt: serverTimestamp() };
    this.seen = { exists: true, version: DOCUMENT_VERSION, data };
    await this.commit(setDoc(this.ref, document));
  }

  /**
   * Firestore resolves a write only when the server acknowledges it, which
   * never happens offline. The device's cache applies operations in order,
   * so a cache read queued after the write returns once the write is on this
   * device (and queued to sync). The server's answer arrives later: a refusal
   * goes to subscribers' `onError`.
   */
  private async commit(acknowledged: Promise<void>): Promise<void> {
    this.lastWrite = acknowledged;
    acknowledged.catch((e: unknown) => {
      const error = e instanceof Error ? e : new Error(String(e));
      for (const listener of this.writeErrorListeners) listener(error);
    });
    await getDocFromCache(this.ref).catch(() => undefined);
  }

  /** Records what a snapshot shows and returns it as AppData, migrating version 1. */
  private note(snap: DocumentSnapshot): AppData | null {
    if (!snap.exists()) {
      this.seen = { exists: false, version: 0, data: null };
      return null;
    }
    const stored = snap.data() as Partial<UserDocument> & { data?: unknown };
    const version = typeof stored.version === "number" ? stored.version : 1;
    if (version > DOCUMENT_VERSION) {
      this.seen = { exists: true, version, data: null };
      throw new NewerDataError();
    }
    const data =
      version >= 2 ? fromKeyedAppData(stored.data) : withDefaults((stored.data ?? {}) as Partial<AppData>);
    this.seen = { exists: true, version, data };
    return data;
  }
}
