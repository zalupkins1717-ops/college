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
