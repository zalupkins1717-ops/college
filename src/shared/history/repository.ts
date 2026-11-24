import { localHistoryDatabase } from './database';
import type { HistoryRepository } from './database';

declare global {
  interface Window { __MERA_SQLITE__?: boolean }
}

export const usingSQLite = typeof window !== 'undefined' && window.__MERA_SQLITE__ === true;
export const historyStorageLabel = usingSQLite ? 'История сохраняется в SQLite' : 'История сохраняется в этом браузере';

function sqliteRepository(): HistoryRepository {
  let session: Promise<void> | undefined;
  const eventName = 'mera:server-history';
  let channel: BroadcastChannel | undefined;
  const listeners = new Set<() => void>();
  const refresh = () => { for (const fn of listeners) fn(); };
  const focus = () => { if (document.visibilityState === 'visible') refresh(); };
  function ready() {
    session ??= fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('Не удалось открыть сеанс SQLite.'); })
      .catch((error: unknown) => { session = undefined; throw error; });
    return session;
  }
  async function request(path = '', init?: RequestInit) {
    await ready();
    const response = await fetch('/api/history' + path, { cache: 'no-store', credentials: 'same-origin', ...init });
    if (!response.ok) {
      if (response.status === 401) session = undefined;
      throw new Error('Сервер истории вернул ошибку.');
    }
    return response;
  }
  function notify() {
    refresh();
    try { channel?.postMessage('changed'); } catch { /* The local view is already refreshed. */ }
  }
  return {
    async list() { return (await request()).json(); },
    async add(entry) {
      await request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      notify();
    },
    async remove(id) { await request('/' + encodeURIComponent(id), { method: 'DELETE' }); notify(); },
    async clear() { await request('', { method: 'DELETE' }); notify(); },
    subscribe(fn) {
      if (!listeners.size) {
        if (typeof BroadcastChannel !== 'undefined') {
          try { channel = new BroadcastChannel(eventName); channel.onmessage = refresh; } catch { /* Refocus refresh still works. */ }
        }
        document.addEventListener('visibilitychange', focus);
      }
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
        if (!listeners.size) {
          document.removeEventListener('visibilitychange', focus);
          channel?.close(); channel = undefined;
        }
      };
    },
  };
}

export const historyRepository = usingSQLite ? sqliteRepository() : localHistoryDatabase;
