export interface HistoryEntry {
  id: string;
  calculatorId: string;
  title: string;
  createdAt: string;
  inputs: Record<string, string>;
  summary: string;
  details: string[];
  unit: string;
  numericalResult?: {
    value?: number;
    segments?: Array<Array<{ x: number; y: number }>>;
  };
}

export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'createdAt'>;

export interface HistoryRepository {
  add(entry: NewHistoryEntry): Promise<void>;
  list(): Promise<HistoryEntry[]>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  subscribe(callback: () => void): () => void;
}

const DATABASE_NAME = 'mera-history';
const LEGACY_KEY = 'mera:history:v1';
const CHANGE_KEY = 'mera:history:changed';
const LIMIT = 50;
let connection: Promise<IDBDatabase> | undefined;

function isLegacyEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.calculatorId === 'string' &&
    typeof item.title === 'string' && typeof item.summary === 'string' &&
    typeof item.unit === 'string' && typeof item.createdAt === 'string' &&
    Number.isFinite(Date.parse(item.createdAt)) && !!item.inputs &&
    typeof item.inputs === 'object' && !Array.isArray(item.inputs) &&
    Object.values(item.inputs).every(input => typeof input === 'string') &&
    Array.isArray(item.details) && item.details.every(detail => typeof detail === 'string');
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Браузер отменил запись в историю.'));
  });
}

function trimToLimit(store: IDBObjectStore) {
  // This runs in the same write transaction as the insert, including when several tabs save at once.
  const count = store.count();
  count.onsuccess = () => {
    let excess = count.result - LIMIT;
    if (excess <= 0) return;
    const oldest = store.index('chronology').openKeyCursor();
    oldest.onsuccess = () => {
      const cursor = oldest.result;
      if (!cursor || excess <= 0) return;
      store.delete(cursor.primaryKey);
      if (--excess > 0) cursor.continue();
    };
  };
}

function stored(entry: HistoryEntry) {
  return { entry, timestamp: Date.parse(entry.createdAt) };
}

async function migrateHistory(db: IDBDatabase) {
  let raw: string | null;
  try { raw = window.localStorage.getItem(LEGACY_KEY); }
  catch { return; } // IndexedDB can be available even when localStorage is blocked.
  if (raw === null) return;

  let records: unknown;
  try { records = JSON.parse(raw); }
  catch { return; } // Keep unreadable legacy data intact.
  if (!Array.isArray(records)) return;
  const valid = records.filter(isLegacyEntry);
  const tx = db.transaction(['calculations', 'meta'], 'readwrite');
  const done = completed(tx);
  const marker = tx.objectStore('meta');
  const imported = marker.get(LEGACY_KEY);
  imported.onsuccess = () => {
    if (imported.result) return;
    const store = tx.objectStore('calculations');
    const seen = new Set<string>();
    const entries = valid.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .filter(entry => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      }).slice(0, LIMIT).reverse();
    const existing = store.getAll();
    existing.onsuccess = () => {
      const known = new Set(existing.result.map((row: { entry: HistoryEntry }) => row.entry.id));
      for (const entry of entries) {
        if (!known.has(entry.id)) store.add(stored(entry));
      }
      marker.put(true, LEGACY_KEY);
      trimToLimit(store);
    };
  };
  await done;
  if (valid.length === records.length) {
    try {
      if (window.localStorage.getItem(LEGACY_KEY) === raw) window.localStorage.removeItem(LEGACY_KEY);
    } catch { /* A committed migration is idempotent even if cleanup is blocked. */ }
  }
}

function connect(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const open = window.indexedDB.open(DATABASE_NAME, 1);
    let blocked = false;
    open.onupgradeneeded = () => {
      const db = open.result;
      const store = db.createObjectStore('calculations', { keyPath: 'sequence', autoIncrement: true });
      store.createIndex('id', 'entry.id', { unique: true });
      store.createIndex('chronology', ['timestamp', 'sequence']);
      db.createObjectStore('meta');
    };
    open.onblocked = () => {
      blocked = true;
      reject(new Error('Закройте другие вкладки «Меры», чтобы обновить базу истории.'));
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (blocked) { db.close(); return; }
      const reset = () => { connection = undefined; };
      db.onversionchange = () => { db.close(); reset(); };
      db.onclose = reset;
      migrateHistory(db).then(() => resolve(db), error => { db.close(); reject(error); });
    };
  }).catch((error: unknown) => { connection = undefined; throw error; });
  return connection;
}

const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;

function changed() { for (const callback of listeners) callback(); }

function notify() {
  changed();
  try {
    if (channel) { channel.postMessage('changed'); return; }
    if (typeof BroadcastChannel !== 'undefined') {
      const sender = new BroadcastChannel(CHANGE_KEY);
      sender.postMessage('changed');
      sender.close();
      return;
    }
  } catch { /* Fall through to the storage event. */ }
  try { window.localStorage.setItem(CHANGE_KEY, crypto.randomUUID()); } catch { /* Local subscribers were notified. */ }
}

function storageChanged(event: StorageEvent) { if (event.key === CHANGE_KEY) changed(); }

function subscribe(callback: () => void): () => void {
  if (!listeners.size) {
    try {
      channel = new BroadcastChannel(CHANGE_KEY);
      channel.onmessage = changed;
    } catch { /* Older browsers use storage events. */ }
    window.addEventListener('storage', storageChanged);
    window.addEventListener('focus', changed);
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (listeners.size) return;
    channel?.close();
    channel = undefined;
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener('focus', changed);
  };
}

async function write(operation: (store: IDBObjectStore) => void) {
  const db = await connect();
  const tx = db.transaction('calculations', 'readwrite');
  const done = completed(tx);
  operation(tx.objectStore('calculations'));
  await done;
  notify();
}

export const localHistoryDatabase: HistoryRepository = {
  async list() {
    const db = await connect();
    const tx = db.transaction('calculations', 'readonly');
    const done = completed(tx);
    const rows = tx.objectStore('calculations').index('chronology').getAll();
    await done;
    return rows.result.reverse().map((row: { entry: HistoryEntry }) => row.entry);
  },
  add(input) {
    return write(store => {
      store.add(stored({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }));
      trimToLimit(store);
    });
  },
  remove(id) {
    return write(store => {
      const key = store.index('id').getKey(id);
      key.onsuccess = () => { if (key.result !== undefined) store.delete(key.result); };
    });
  },
  async clear() {
    const db = await connect();
    const tx = db.transaction(['calculations', 'meta'], 'readwrite');
    const done = completed(tx);
    tx.objectStore('calculations').clear();
    tx.objectStore('meta').put(true, LEGACY_KEY);
    await done;
    // Clear also removes an unreadable v1 snapshot that migration intentionally preserved.
    try { window.localStorage.removeItem(LEGACY_KEY); } catch { /* Storage may be blocked. */ }
    notify();
  },
  subscribe,
};

export const historyDatabase = localHistoryDatabase;
