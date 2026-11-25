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
import type { DocumentReference, DocumentSnapshot, FirestoreError } from "firebase/firestore";
import { changesBetween, NewerDataError, withDefaults } from "./dataStore";
import type { AppData, DataChange, DataStore, StoreState } from "./dataStore";

/**
 * The shape of `users/{uid}` this version writes (ADR 0003):
 *
 *     { version: 2, updatedAt, data: {
 *         settings: { hireDate, weeklyHours, ... },
 *         earnDateEdits: { "vacation:2026:3": "2026-04-06", ... },
 *         occasionsById: { <id>: Occasion, <deleted id>: null },
 *         occasions: [Occasion, ...]   // version 1's list, kept as it was, never written
 *     } }
 *
 * Every setting, Occasion and Earn Date edit is its own field, so a save
 * writes only the entries it changed. Version 1 kept Occasions as a list
 * under `occasions`; that list stays as the starting point, and each
 * Occasion saved since is in `occasionsById`, where a deleted one is null so
 * the list can't bring it back.
 */
export const DOCUMENT_VERSION = 2;

export interface FirestoreDataStoreOptions {
  /**
   * Called when this tab's Firestore client was shut down underneath it, as
   * the SDK does when another tab signs out and clears the offline cache.
   * Nothing this store does can work after that.
   */
  onClientLost?: () => void;
}

/** What this store last saw of the document: from a load, a snapshot or its own write. */
interface Seen {
  exists: boolean;
  version: number;
}

/**
 * Keeps AppData in the signed-in account's one Firestore document,
 * `users/{uid}`. With offline persistence on, saves land in the device's cache
 * first and sync when online.
 *
 * - An edit writes only the entries it changed, so edits other devices made
 *   meanwhile to anything else survive, whatever this device's copy was. No
 *   edit ever writes the whole document: only `save` (Replace, in the
 *   first-sign-in handoff) does, by design.
 * - While it has seen the document, an edit is an update, which fails if the
 *   document was deleted elsewhere meanwhile, so a stale device can't bring
 *   deleted data back. With no document seen, an edit creates it, or merges
 *   into one another device just created.
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

  constructor(
    private readonly ref: DocumentReference,
    private readonly options: FirestoreDataStoreOptions = {},
  ) {}

  async load(): Promise<AppData | null> {
    return this.note(await getDoc(this.ref));
  }

  async save(data: AppData): Promise<void> {
    this.checkWritable();
    const document = {
      version: DOCUMENT_VERSION,
      updatedAt: serverTimestamp(),
      data: {
        settings: data.settings,
        earnDateEdits: data.earnDateEdits,
        occasionsById: Object.fromEntries(data.occasions.map((o) => [o.id, o])),
      },
    };
    this.seen = { exists: true, version: DOCUMENT_VERSION };
    await this.commit(setDoc(this.ref, document));
  }

  async update(before: AppData, after: AppData): Promise<void> {
    this.checkWritable();
    const changes = changesBetween(before, after);
    if (changes.length === 0) return;
    const fields = changes.map(storedField);
    const version = new FieldPath("version");
    const updatedAt = new FieldPath("updatedAt");

    if (this.seen?.exists) {
      const pairs = fields.flatMap(({ path, value }) => [path, value]);
      await this.commit(updateDoc(this.ref, version, DOCUMENT_VERSION, updatedAt, serverTimestamp(), ...pairs));
      return;
    }
    // No document seen: create it with just these entries, or merge them into
    // one another device created meanwhile.
    const data: Record<string, Record<string, unknown>> = {};
    for (const { section, key, value } of fields) (data[section] ??= {})[key] = value;
    this.seen = { exists: true, version: DOCUMENT_VERSION };
    await this.commit(
      setDoc(
        this.ref,
        { version: DOCUMENT_VERSION, updatedAt: serverTimestamp(), data },
        { mergeFields: [version, updatedAt, ...fields.map((f) => f.path)] },
      ),
    );
  }

  async clear(): Promise<void> {
    this.deleted = true;
    this.seen = { exists: false, version: 0 };
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
      (error: FirestoreError) => {
        // A listener ends with "aborted" when its client is shut down.
        if (error.code === "aborted") this.options.onClientLost?.();
        onError(error);
      },
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

  /** Records what a snapshot shows and returns it as AppData. */
  private note(snap: DocumentSnapshot): AppData | null {
    if (!snap.exists()) {
      this.seen = { exists: false, version: 0 };
      return null;
    }
    const stored = snap.data() as { version?: unknown; data?: unknown };
    const version = typeof stored.version === "number" ? stored.version : 1;
    this.seen = { exists: true, version };
    if (version > DOCUMENT_VERSION) throw new NewerDataError();
    return fromStoredData(stored.data);
  }
}

/** Where one changed entry lives in the document, and what to write there. */
function storedField({ section, key, value }: DataChange) {
  if (section === "occasions") {
    // A deleted Occasion stays as null: deleting the field would let version
    // 1's list bring it back.
    return { section: "occasionsById", key, path: new FieldPath("data", "occasionsById", key), value: value ?? null };
  }
  return { section, key, path: new FieldPath("data", section, key), value: value === undefined ? deleteField() : value };
}

/**
 * The document's `data` as AppData: version 1's Occasion list (if any) as the
 * starting point, overlaid by `occasionsById`, where null means deleted.
 * Everything is checked like any other save.
 */
export function fromStoredData(data: unknown): AppData {
  const raw = isRecord(data) ? data : {};
  const occasions = new Map<string, unknown>();
  const base = Array.isArray(raw.occasions) ? raw.occasions : isRecord(raw.occasions) ? Object.values(raw.occasions) : [];
  for (const o of base) if (isRecord(o) && typeof o.id === "string") occasions.set(o.id, o);
  if (isRecord(raw.occasionsById)) {
    for (const [id, o] of Object.entries(raw.occasionsById)) {
      if (o === null) occasions.delete(id);
      else occasions.set(id, isRecord(o) ? { ...o, id } : o);
    }
  }
  return withDefaults({
    settings: raw.settings,
    occasions: [...occasions.values()],
    earnDateEdits: raw.earnDateEdits,
  } as Partial<AppData>);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
