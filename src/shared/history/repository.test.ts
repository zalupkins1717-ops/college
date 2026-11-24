import { afterEach, expect, it, vi } from 'vitest';
import type { NewHistoryEntry } from './database';

const calculation: NewHistoryEntry = {
  calculatorId: 'derivative',
  title: 'Производная',
  inputs: { expression: 'x^2', x: '3' },
  summary: '6',
  details: [],
  unit: '',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('отправляет введённые данные в API и получает историю с сервера', async () => {
  const saved = { ...calculation, id: 'one', createdAt: '2026-11-24T10:00:00Z' };
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 201 }))
    .mockResolvedValueOnce(Response.json([saved]));
  vi.stubGlobal('fetch', fetch);
  const { historyRepository } = await import('./repository');

  await historyRepository.add(calculation);
  expect(await historyRepository.list()).toEqual([saved]);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/session', '/api/history', '/api/history']);
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', body: JSON.stringify(calculation) });
});

it('показывает ошибку при недоступности API и позволяет повторить запись', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('<html></html>'))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  const { historyRepository } = await import('./repository');

  await expect(historyRepository.add(calculation)).rejects.toThrow('сеанс');
  await historyRepository.add(calculation);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('не подтверждает сохранение, если сервер вернул обычную страницу вместо записи в БД', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response('<html></html>')));
  const { historyRepository } = await import('./repository');
  await expect(historyRepository.add(calculation)).rejects.toThrow('Сервер истории');
});

const frontend = 'https://example.github.io/college/index.html#/area';
const api = 'https://mera.example/api';
const token = 'a'.repeat(43);

function pagesSession(options: { initialCookie?: string; blockCookies?: boolean } = {}) {
  vi.stubEnv('VITE_HISTORY_API_URL', api);
  vi.stubGlobal('window', { location: new URL(frontend) });
  let value = options.initialCookie ?? '';
  const writeCookie = vi.fn((header: string) => {
    if (!options.blockCookies) value = header.split(';')[0];
  });
  vi.stubGlobal('document', { get cookie() { return value; }, set cookie(header: string) { writeCookie(header); } });
  return writeCookie;
}

it('сохраняет в cookie только ключ сеанса и отправляет записи на выделенный сервер', async () => {
  const writeCookie = pagesSession();
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ token }, { status: 201 }))
    .mockResolvedValueOnce(new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  const { historyRepository } = await import('./repository');

  await historyRepository.add(calculation);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([api + '/session', api + '/history']);
  expect(writeCookie).toHaveBeenCalledWith('mera_history_session=' + token + '; Path=/college/; Max-Age=31536000; Secure; SameSite=Strict');
  const [, opening] = fetch.mock.calls[0];
  expect(opening.headers.has('Authorization')).toBe(false);
  const [, write] = fetch.mock.calls[1];
  expect(opening.credentials).toBe('omit');
  expect(write.credentials).toBe('omit');
  expect(write.headers.get('X-Mera-Client')).toBe('pages');
  expect(write.headers.get('Authorization')).toBe('Bearer ' + token);
  expect(write.body).toBe(JSON.stringify(calculation));
});

it('открывает существующий сеанс после обновления страницы', async () => {
  const writeCookie = pagesSession({ initialCookie: 'mera_history_session=' + token });
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json([]));
  vi.stubGlobal('fetch', fetch);
  const { historyRepository } = await import('./repository');

  expect(await historyRepository.list()).toEqual([]);
  expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer ' + token);
  expect(writeCookie).not.toHaveBeenCalled();
});

it('останавливает отправку расчёта, если получить постоянный ключ сеанса не удалось', async () => {
  pagesSession({ blockCookies: true });
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ token }, { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  const { historyRepository } = await import('./repository');

  await expect(historyRepository.add(calculation)).rejects.toThrow('персональную историю');
  expect(fetch).toHaveBeenCalledTimes(1);
});
