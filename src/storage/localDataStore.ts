import { emptyAppData } from "./dataStore";
import type { AppData, DataStore } from "./dataStore";

/** The part of the Web Storage API we use; `window.localStorage` fits. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY = "time-off-tracker";
const VERSION = 1;

interface Envelope {
  version: number;
  data: Partial<AppData>;
}

/** Keeps AppData in this browser's local storage (signed-out use). */
export class LocalDataStore implements DataStore {
  constructor(private readonly storage: KeyValueStorage) {}

  async load(): Promise<AppData | null> {
    const raw = this.storage.getItem(KEY);
    if (raw === null) return null;
    try {
      const { data } = JSON.parse(raw) as Envelope;
      const empty = emptyAppData();
      return {
        settings: { ...empty.settings, ...data.settings },
        occasions: data.occasions ?? empty.occasions,
        earnDateEdits: data.earnDateEdits ?? empty.earnDateEdits,
      };
    } catch {
      return null;
    }
  }

  async save(data: AppData): Promise<void> {
    const envelope: Envelope = { version: VERSION, data };
    this.storage.setItem(KEY, JSON.stringify(envelope));
  }

  async clear(): Promise<void> {
    this.storage.removeItem(KEY);
  }
}
