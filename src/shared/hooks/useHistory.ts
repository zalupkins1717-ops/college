import { useCallback, useRef, useState } from 'react';

export interface HistoryEntry {
  id: string;
  calculatorId: string;
  title: string;
  createdAt: string;
  inputs: Record<string, string>;
  summary: string;
  details: string[];
  unit: string;
}

type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'createdAt'>;

interface HistoryState {
  entries: HistoryEntry[];
  error: string | null;
}

const STORAGE_KEY = 'mera:history:v1';
const MAX_ENTRIES = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.calculatorId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.summary === 'string' &&
    typeof value.unit === 'string' &&
    isRecord(value.inputs) &&
    Object.values(value.inputs).every((input) => typeof input === 'string') &&
    Array.isArray(value.details) &&
    value.details.every((detail) => typeof detail === 'string')
  );
}

function loadHistory(): HistoryState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { entries: [], error: null };

    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored) || !stored.every(isHistoryEntry)) {
      return {
        entries: [],
        error: 'Не удалось прочитать историю. Сохранённые данные повреждены. Новый расчёт начнёт новую историю.',
      };
    }

    return { entries: stored.slice(0, MAX_ENTRIES), error: null };
  } catch {
    return {
      entries: [],
      error: 'История недоступна. Проверьте, разрешено ли браузеру сохранять данные этого сайта.',
    };
  }
}

export function useHistory() {
  const [state, setState] = useState<HistoryState>(loadHistory);
  const entriesRef = useRef(state.entries);

  const persist = useCallback((entries: HistoryEntry[]): boolean => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      entriesRef.current = entries;
      setState({ entries, error: null });
      return true;
    } catch {
      setState((current) => ({
        ...current,
        error: 'Не удалось сохранить изменения в истории. Проверьте доступ к памяти браузера и свободное место.',
      }));
      return false;
    }
  }, []);

  const save = useCallback((entry: NewHistoryEntry): boolean => {
    const next: HistoryEntry = {
      ...entry,
      id: globalThis.crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    return persist([next, ...entriesRef.current].slice(0, MAX_ENTRIES));
  }, [persist]);

  const remove = useCallback((id: string) => {
    persist(entriesRef.current.filter((entry) => entry.id !== id));
  }, [persist]);

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  return { entries: state.entries, save, remove, clear, error: state.error };
}
