import type { Pattern, Session } from './types';

const DB_NAME = 'stitch-locator';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('patterns')) db.createObjectStore('patterns', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('session')) db.createObjectStore('session');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export const db = {
  async allPatterns(): Promise<Pattern[]> {
    return tx('patterns', 'readonly', (s) => s.getAll() as IDBRequest<Pattern[]>);
  },
  async putPattern(p: Pattern): Promise<void> {
    await tx('patterns', 'readwrite', (s) => s.put(p));
  },
  async deletePattern(id: string): Promise<void> {
    await tx('patterns', 'readwrite', (s) => s.delete(id));
  },
  async getSession(): Promise<Session | null> {
    const v = await tx('session', 'readonly', (s) => s.get('current') as IDBRequest<Session | undefined>);
    return v ?? null;
  },
  async putSession(s: Session): Promise<void> {
    await tx('session', 'readwrite', (st) => st.put(s, 'current'));
  },
  async clearSession(): Promise<void> {
    await tx('session', 'readwrite', (s) => s.delete('current'));
  },
};
