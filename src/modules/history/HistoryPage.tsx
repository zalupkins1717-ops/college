import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Download, History, RotateCcw, Trash2 } from 'lucide-react';
import type { HistoryEntry } from '../../shared/hooks/useHistory';

import { historyStorageLabel } from '../../shared/history/repository';

interface HistoryPageProps {
  loading: boolean;
  entries: HistoryEntry[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onRestore: (entry: HistoryEntry) => void;
  error: string | null;
}

const inputLabels: Record<string, string> = {
  expression: 'Функция', axis: 'Переменная', h: 'Шаг', min: 'Начало интервала', max: 'Конец интервала',
  unit: 'Единица', tolerance: 'Допуск, %', ea: 'Погрешность a', eb: 'Погрешность b', exact: 'Точное значение',
  approx: 'Приближение', operation: 'Операция', digits: 'Знаки округления', displayPrecision: 'Точность отображения',
};
const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function csvCell(value: string): string {
  // A quoted CSV cell may still execute as a formula in spreadsheet apps.
  const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadHistory(entries: HistoryEntry[]) {
  const rows = [
    ['Дата', 'Калькулятор', 'Результат', 'Исходные данные', 'Подробности', 'Единица измерения'],
    ...entries.map((entry) => [
      dateFormatter.format(new Date(entry.createdAt)),
      entry.title,
      entry.summary,
      Object.entries(entry.inputs).map(([name, value]) => `${name} = ${value}`).join('; '),
      entry.details.join('; '),
      entry.unit,
    ]),
  ];
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mera-history-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function HistoryPage({ loading, entries, onRemove, onClear, onRestore, error }: HistoryPageProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  function clearHistory() {
    onClear();
    setConfirmClear(false);
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</p>
          <h1>История расчётов</h1>
          <p className="page-description">Вернитесь к сохранённым результатам или продолжите расчёт с прежними данными.</p>
        </div>
      </header>

      {error && <p className="inline-error" role="alert">{error}</p>}

      {loading ? <p role="status">Загрузка истории…</p> : entries.length > 0 ? (
        <>
          <div className="history-actions">
            <p className="history-count">Сохранено: {entries.length} из 50</p>
            <button className="button button-secondary" type="button" onClick={() => downloadHistory(entries)}>
              <Download size={16} aria-hidden="true" /> Скачать CSV
            </button>
            <button className="button button-ghost" type="button" onClick={() => setConfirmClear(true)}>
              <Trash2 size={16} aria-hidden="true" /> Очистить историю
            </button>
          </div>

          {confirmClear && (
            <div className="history-actions history-confirmation" role="alert">
              <p>Удалить все сохранённые расчёты? Восстановить историю не получится.</p>
              <button className="button button-danger" type="button" onClick={clearHistory}>Удалить всё</button>
              <button className="button button-secondary" type="button" onClick={() => setConfirmClear(false)}>Отмена</button>
            </div>
          )}

          <div className="history-list">
            {entries.map((entry) => (
              <article className="history-item" key={entry.id}>
                <div className="history-item-header">
                  <h2>{entry.title}</h2>
                  <time className="history-meta" dateTime={entry.createdAt}>
                    {dateFormatter.format(new Date(entry.createdAt))}
                  </time>
                </div>
                <p className="history-summary">{entry.summary}</p>
                {entry.details.length > 0 && (
                  <p className="muted">{entry.details.join(' · ')}</p>
                )}
                <details className="history-inputs"><summary>Исходные данные</summary><dl>{Object.entries(entry.inputs).map(([key, val]) => <div key={key}><dt>{inputLabels[key] ?? key}</dt><dd>{val || (key === 'h' ? 'Автоматически' : '—')}</dd></div>)}</dl></details>
                <div className="history-item-actions">
                  <button className="button button-secondary" type="button" onClick={() => onRestore(entry)}>
                    <RotateCcw size={15} aria-hidden="true" /> Восстановить
                  </button>
                  <button
                    className="button button-ghost"
                    type="button"
                    aria-label={`Удалить расчёт «${entry.title}» от ${dateFormatter.format(new Date(entry.createdAt))}`}
                    onClick={() => onRemove(entry.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" /> Удалить
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="muted">{historyStorageLabel}. При сохранении 51-го расчёта самый ранний удалится.</p>
        </>
      ) : (
        <section className="empty-state">
          <History size={34} strokeWidth={1.4} aria-hidden="true" />
          <h2>Здесь будут ваши расчёты</h2>
          <p className="muted">Измените данные в калькуляторе или выполните расчёт в разделе «Численные методы». Здесь появятся исходные значения и результат.</p>
          <Link className="button button-primary" to="/area">
            Перейти к расчётам <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
      )}
    </>
  );
}
