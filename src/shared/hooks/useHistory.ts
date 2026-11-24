import { useCallback, useEffect, useState } from 'react';
import type { HistoryEntry, NewHistoryEntry } from '../history/database';
import { historyRepository } from '../history/repository';

export type { HistoryEntry, NewHistoryEntry } from '../history/database';

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  useEffect(() => {
    let latest = 0;
    const refresh = async () => {
      const request = ++latest;
      try {
        const result = await historyRepository.list();
        if (request === latest) { setEntries(result); setReadError(null); }
      } catch {
        if (request === latest) setReadError('Не удалось загрузить историю расчётов. Проверьте соединение с сервером и повторите попытку.');
      } finally {
        if (request === latest) setLoading(false);
      }
    };
    const unsubscribe = historyRepository.subscribe(refresh);
    void refresh();
    return () => { ++latest; unsubscribe(); };
  }, []);

  const change = useCallback(async (operation: () => Promise<void>) => {
    try {
      await operation();
      setWriteError(null);
      return true;
    } catch {
      setWriteError('Не удалось записать изменения в историю. Проверьте соединение с сервером и повторите попытку.');
      return false;
    }
  }, []);
  const save = useCallback((entry: NewHistoryEntry) => change(() => historyRepository.add(entry)), [change]);
  const remove = useCallback((id: string) => change(() => historyRepository.remove(id)), [change]);
  const clear = useCallback(() => change(() => historyRepository.clear()), [change]);

  return { entries, loading, error: writeError ?? readError, save, remove, clear };
}
