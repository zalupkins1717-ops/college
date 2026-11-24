import type { HistoryRepository } from './database';

const apiBase = (import.meta.env.VITE_HISTORY_API_URL || '/api').replace(/\/+$/, '');

const cookieName = 'mera_history_session';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function readSessionToken() {
  const cookie = document.cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(cookieName + '='));
  const token = cookie?.slice(cookieName.length + 1);
  return token && tokenPattern.test(token) ? token : undefined;
}

function saveSessionToken(token: unknown) {
  if (typeof token !== 'string' || !tokenPattern.test(token)) {
    throw new Error('Сервер вернул некорректный идентификатор сеанса.');
  }
  const directory = window.location.pathname.replace(/\/index\.html$/, '/').replace(/\/?$/, '/');
  document.cookie = cookieName + '=' + token + '; Path=' + directory + '; Max-Age=31536000; Secure; SameSite=Strict';
  if (readSessionToken() !== token) throw new Error('Не удалось открыть персональную историю.');
}

// Calls made from Pages use a first-party session identifier since the API has its own origin.
function serverRepository(): HistoryRepository {
  const location = typeof window === 'undefined' ? undefined : window.location;
  const api = location && new URL(apiBase, location.href);
  const crossOrigin = api !== undefined && api.origin !== location?.origin;

  function apiFetch(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    if (crossOrigin) {
      if (api?.protocol !== 'https:' || location?.protocol !== 'https:') {
        throw new Error('Для соединения с сервером требуется HTTPS.');
      }
      headers.set('X-Mera-Client', 'pages');
      const token = readSessionToken();
      if (token) headers.set('Authorization', 'Bearer ' + token);
    }
    return fetch(apiBase + path, {
      ...init, headers, credentials: crossOrigin ? 'omit' : 'same-origin', cache: 'no-store',
      redirect: 'error',
    });
  }

  let session: Promise<void> | undefined;
  let channel: BroadcastChannel | undefined;
  const listeners = new Set<() => void>();

  function refresh() {
    for (const listener of listeners) listener();
  }

  function onVisible() {
    if (document.visibilityState === 'visible') refresh();
  }

  async function openSession() {
    const response = await apiFetch('/session');
    if (crossOrigin && response.status === 201) {
      const sessionInfo = await response.json();
      saveSessionToken(sessionInfo.token);
      return;
    }
    if (response.status !== 204 || (crossOrigin && !readSessionToken())) {
      throw new Error('Не удалось открыть сеанс истории.');
    }
  }

  function ready() {
    if (!session) {
      // Prevent simultaneous first visits in separate tabs from creating different sessions.
      const opening = typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('mera:open-history-session', openSession)
        : openSession();
      session = Promise.resolve(opening).catch((error: unknown) => {
        session = undefined;
        throw error;
      });
    }
    return session;
  }

  async function request(expectedStatus: number, path = '', init?: RequestInit) {
    const endpoint = '/history' + path;
    await ready();
    let response = await apiFetch(endpoint, init);
    if (response.status === 401) {
      session = undefined;
      await ready();
      response = await apiFetch(endpoint, init);
    }
    if (response.status !== expectedStatus) throw new Error('Сервер истории вернул ошибку.');
    return response;
  }

  function notify() {
    refresh();
    try { channel?.postMessage('changed'); } catch { /* Other tabs refresh when visible. */ }
  }

  return {
    async list() {
      return (await request(200)).json();
    },
    async add(entry) {
      await request(201, '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      notify();
    },
    async remove(id) {
      await request(204, '/' + encodeURIComponent(id), { method: 'DELETE' });
      notify();
    },
    async clear() {
      await request(204, '', { method: 'DELETE' });
      notify();
    },
    subscribe(listener) {
      if (!listeners.size) {
        if (typeof BroadcastChannel !== 'undefined') {
          try {
            channel = new BroadcastChannel('mera:server-history');
            channel.onmessage = refresh;
          } catch { /* Refreshing on visibility change is still available. */ }
        }
        document.addEventListener('visibilitychange', onVisible);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          document.removeEventListener('visibilitychange', onVisible);
          channel?.close();
          channel = undefined;
        }
      };
    },
  };
}

export const historyRepository = serverRepository();
