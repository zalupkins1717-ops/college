import type { NewHistoryEntry } from './database';
import { historyRepository } from './repository';

export interface Recorded<T> {
  result: T;
  entry: NewHistoryEntry;
  warning?: string;
}

/** A completed calculation is recorded once, after the method returns successfully. */
export function recordCalculation<This, Args extends unknown[], T>(
  method: (this: This, ...args: Args) => Promise<Recorded<T>>,
  _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Recorded<T>>>,
) {
  return async function (this: This, ...args: Args): Promise<Recorded<T>> {
    const completed = await method.apply(this, args);
    try {
      await historyRepository.add(completed.entry);
      return completed;
    } catch {
      return { ...completed, warning: 'Расчёт выполнен. Сохранить его в базу не удалось.' };
    }
  };
}
