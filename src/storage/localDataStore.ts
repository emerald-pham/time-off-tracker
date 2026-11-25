import { applyChanges, changesBetween, NewerDataError, withDefaults } from "./dataStore";
import type { AppData, DataStore, StoreState } from "./dataStore";

/** The part of the Web Storage API we use; `window.localStorage` fits. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface LocalDataStoreOptions {
  /**
   * Calls `onChange` when another tab changes `key` (the browser's `storage`
   * event). Returns the unsubscribe.
   */
  watch?: (key: string, onChange: () => void) => () => void;
}

const KEY = "time-off-tracker";
/** The envelope's shape: `{ version: 1, data: AppData }`. */
const VERSION = 1;

type Listener = { onChange: (state: StoreState) => void; onError: (error: Error) => void };

/**
 * Keeps AppData in this browser's local storage (signed-out use).
 *
 * Edits are read-modify-write against what's stored now, so two tabs editing
 * different settings, Occasions or Earn Date edits both keep their changes.
 * If the browser refuses storage (blocked, private browsing, full), the store
 * carries on in memory and reports `notKept`, rather than failing.
 */
export class LocalDataStore implements DataStore {
  private readonly storage: () => KeyValueStorage;
  private readonly memory = memoryStorage();
  private kept = true;
  private readonly listeners = new Set<Listener>();

  /** `storage` may be a getter, since even reading `window.localStorage` can throw. */
  constructor(
    storage: KeyValueStorage | (() => KeyValueStorage),
    private readonly options: LocalDataStoreOptions = {},
  ) {
    this.storage = typeof storage === "function" ? storage : () => storage;
  }

  async load(): Promise<AppData | null> {
    return this.read();
  }

  async save(data: AppData): Promise<void> {
    this.read(); // refuses to overwrite a newer version's data
    this.write(data);
  }

  async update(before: AppData, after: AppData): Promise<void> {
    const current = this.read();
    this.write(current ? applyChanges(current, changesBetween(before, after)) : after);
  }

  async clear(): Promise<void> {
    this.attempt((s) => s.removeItem(KEY));
    this.notifyAll();
  }

  /** Local writes are done when they return. */
  async synced(): Promise<void> {}

  subscribe(onChange: (state: StoreState) => void, onError: (error: Error) => void): () => void {
    const listener = { onChange, onError };
    this.listeners.add(listener);
    const unwatch = this.options.watch?.(KEY, () => this.notify(listener)) ?? (() => {});
    queueMicrotask(() => {
      if (this.listeners.has(listener)) this.notify(listener);
    });
    return () => {
      this.listeners.delete(listener);
      unwatch();
    };
  }

  private read(): AppData | null {
    const raw = this.attempt((s) => s.getItem(KEY));
    if (raw === null) return null;
    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof envelope !== "object" || envelope === null) return null;
    const { version, data } = envelope as { version?: unknown; data?: unknown };
    if (typeof version === "number" && version > VERSION) throw new NewerDataError();
    return withDefaults((data ?? {}) as Partial<AppData>);
  }

  private write(data: AppData): void {
    this.attempt((s) => s.setItem(KEY, JSON.stringify({ version: VERSION, data })));
    this.notifyAll();
  }

  /**
   * Runs a storage call. If the browser refuses it, switches to memory for
   * the rest of this page's life, so the person can keep going, and reports
   * that the data won't be kept.
   */
  private attempt<T>(call: (storage: KeyValueStorage) => T): T {
    if (this.kept) {
      try {
        return call(this.storage());
      } catch {
        this.kept = false;
      }
    }
    return call(this.memory);
  }

  private notify(listener: Listener): void {
    let data: AppData | null;
    try {
      data = this.read();
    } catch (e) {
      listener.onError(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    listener.onChange({ data, unsynced: false, notKept: !this.kept });
  }

  private notifyAll(): void {
    for (const listener of this.listeners) this.notify(listener);
  }
}

/**
 * A yes/no kept in local storage; null until it's first written. It never
 * throws: if the browser blocks storage, it just forgets.
 */
export function storedFlag(storage: () => KeyValueStorage, key: string) {
  return {
    read(): boolean | null {
      try {
        const value = storage().getItem(key);
        return value === null ? null : value === "1";
      } catch {
        return null;
      }
    },
    write(on: boolean): void {
      try {
        storage().setItem(key, on ? "1" : "0");
      } catch {
        // Nothing to keep it in; it's only a hint.
      }
    },
  };
}

/** A KeyValueStorage that lives only as long as the page. */
export function memoryStorage(): KeyValueStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}
