import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, ChevronDown, History } from 'lucide-react';
import { NumericField } from '../../shared/ui/NumericField';
import type { HistoryEntry } from '../../shared/hooks/useHistory';
import FunctionPlot from './FunctionPlot';
import { previewNumerical, runNumerical } from './service';
import type { NumericalMode } from './service';
import './numerical.css';

type Fields = Record<string, string>;
type Calculation = Awaited<ReturnType<typeof runNumerical>>;
type Display = {
  kind: 'example' | 'restored' | 'calculated' | 'draft';
  result?: Calculation;
  error?: string;
};

const examples: Record<NumericalMode, Fields[]> = {
  derivative: [
    { expression: 'x^3', x: '2', h: '' },
    { expression: 'sin(x)', x: '0', h: '' },
    { expression: 'ln(x)', x: '1', h: '' },
  ],
  partial: [
    { expression: 'x^2*y + sin(z)', x: '2', y: '3', z: '0', axis: 'x', h: '' },
    { expression: 'x*y^2', x: '2', y: '3', z: '0', axis: 'y', h: '' },
    { expression: 'z^3 + x*y', x: '1', y: '2', z: '2', axis: 'z', h: '' },
  ],
  plot: [
    { expression: 'sin(x)', min: '-6', max: '6' },
    { expression: 'x^2', min: '-3', max: '3' },
    { expression: '1/x', min: '-4', max: '4' },
  ],
};

const titles = {
  derivative: 'Производная функции',
  partial: 'Частная производная',
  plot: 'График функции',
};

const descriptions = {
  derivative: 'Найдите скорость изменения функции в выбранной точке по центральной разности.',
  partial: 'Выберите переменную и точку. При вычислении остальные координаты остаются постоянными.',
  plot: 'Задайте выражение и интервал по x, чтобы посмотреть, как меняется значение функции.',
};

function asMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить расчёт. Проверьте исходные данные.';
}

function preview(mode: NumericalMode, fields: Fields, kind: Display['kind']): Display {
  try {
    return { kind, result: previewNumerical(mode, fields) };
  } catch (error) {
    return { kind, error: asMessage(error) };
  }
}

export default function NumericalPage({ mode }: { mode: NumericalMode }) {
  const location = useLocation();
  const entry = (location.state as { restore?: HistoryEntry } | null)?.restore;
  return <NumericalWorkspace key={mode + location.key} mode={mode}
    restore={entry?.calculatorId === mode ? entry.inputs : undefined} />;
}

function NumericalWorkspace({ mode, restore }: { mode: NumericalMode; restore?: Fields }) {
  const [inputs, setInputs] = useState<Fields>(() => ({ ...examples[mode][0], ...restore }));
  const [display, setDisplay] = useState<Display>(() => preview(mode, inputs, restore ? 'restored' : 'example'));
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const expressionId = useId();
  const isPlot = mode === 'plot';
  const isPartial = mode === 'partial';
  const set = (field: string, value: string) => {
    setInputs((current) => ({ ...current, [field]: value }));
    setDisplay({ kind: 'draft' });
  };

  async function calculate(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    try {
      setDisplay({ kind: 'calculated', result: await runNumerical(mode, inputs) });
    } catch (error) {
      setDisplay({ kind: 'draft', error: asMessage(error) });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  const chooseExample = (example: Fields) => {
    setInputs({ ...example });
    setDisplay(preview(mode, example, 'example'));
  };
  const field = (name: string, label: string, hint?: string) =>
    <NumericField key={name} name={name} label={label} value={inputs[name] ?? ''}
      onChange={(value) => set(name, value)} hint={hint} />;
  const { result, error, kind } = display;
  return <>
    <header className="page-heading">
      <div><h1>{titles[mode]}</h1><p className="page-description">{descriptions[mode]}</p></div>
    </header>
    <div className={'numerical-layout' + (isPlot ? ' numerical-plot-layout' : '')}>
      <form onSubmit={calculate} className="panel numerical-form">
        <h2>Исходные данные</h2>
        <fieldset disabled={pending} className="numerical-fieldset">
          <div className="numeric-field">
            <label htmlFor={expressionId}>{isPartial ? 'Функция f(x, y, z)' : 'Функция f(x)'}</label>
            <div className="input-wrap">
              <input id={expressionId} name="expression" type="text" required spellCheck={false}
                autoComplete="off" autoCapitalize="none" className="numerical-expression"
                value={inputs.expression} onChange={(event) => set('expression', event.target.value)} />
            </div>
          </div>
          <div className="numerical-examples" role="group" aria-label="Примеры функций">
            <span>Примеры</span>
            {examples[mode].map((example) =>
              <button type="button" key={example.expression} onClick={() => chooseExample(example)}
                aria-label={'Подставить пример ' + example.expression}>{example.expression}</button>)}
          </div>
          {isPartial && <div className="numerical-axis">
            <span id={expressionId + '-axis'}>Переменная производной</span>
            <div className="numerical-axis-options" role="group" aria-labelledby={expressionId + '-axis'}>
              {['x', 'y', 'z'].map((axis) => <button type="button" key={axis} aria-pressed={inputs.axis === axis}
                aria-label={'По переменной ' + axis} onClick={() => set('axis', axis)}>∂/∂{axis}</button>)}
            </div>
          </div>}
          <div className={'fields-grid numerical-coordinates' + (isPartial ? ' numerical-three' : '')}>
            {isPlot ? <>{field('min', 'Начало интервала x')}{field('max', 'Конец интервала x')}</> :
              isPartial ? ['x', 'y', 'z'].map((axis) => field(axis, 'Координата ' + axis)) :
                field('x', 'Точка x')}
            {mode === 'derivative' && field('h', 'Шаг h', 'Пусто — автоматический шаг.')}
          </div>
          {isPartial && field('h', 'Шаг h', 'Пусто — автоматический шаг.')}
          <button type="submit" className="button button-primary numerical-submit" disabled={pending}>
            {pending ? 'Выполняется…' : (isPlot ? 'Построить и сохранить' : 'Вычислить и сохранить')}<ArrowRight size={16} />
          </button>
        </fieldset>
        <details className="numerical-help">
          <summary><BookOpen size={16} />Как записать функцию<ChevronDown size={15} /></summary>
          <p>Умножение обозначается <code>*</code>, степень — <code>^</code>. Для группировки используйте скобки.
            {' '}Например, <code>2*x</code>, <code>sqrt(x)</code>, <code>exp(x)</code>, <code>ln(x)</code>, <code>sin(pi*x)</code>.
            {' '}Углы задаются в радианах.</p>
        </details>
      </form>
      <section className="result-panel numerical-result" aria-label={isPlot ? 'График функции' : 'Результат'}>
        <div className="result-heading"><h2>{isPlot ? 'График' : 'Результат'}</h2>
          {result && kind === 'example' && <span>Предпросмотр примера</span>}
          {result && kind === 'restored' && <span>Из истории</span>}
        </div>
        <div aria-live="polite" aria-atomic="true">
          {error && <p className="inline-error">{error}</p>}
          {!error && !result && <p className="numerical-empty">
            {isPlot ? 'Нажмите «Построить и сохранить», чтобы увидеть график с новыми параметрами.' :
              'Нажмите «Вычислить и сохранить», чтобы получить значение для новых данных.'}
          </p>}
          {result && <>
            {isPlot && result.segments && <FunctionPlot key={JSON.stringify([inputs.expression, inputs.min, inputs.max])}
              segments={result.segments} expression={inputs.expression}
              min={Number(inputs.min.trim().replace(',', '.'))} max={Number(inputs.max.trim().replace(',', '.'))} />}
            <p className={isPlot ? 'numerical-plot-summary' : 'numerical-answer'}>{result.summary}</p>
            {result.details.length > 0 && <ul className="numerical-details">
              {result.details.map((detail, index) => <li key={index}>{detail}</li>)}
            </ul>}
            {result.warning && <p className="inline-error">{result.warning}</p>}
            {kind === 'calculated' && !result.warning && <div className="numerical-saved">
              <Check size={15} aria-hidden="true" />Сохранено в истории
              <Link to="/history"><History size={14} aria-hidden="true" />Открыть</Link>
            </div>}
          </>}
        </div>
      </section>
    </div>
  </>;
}
