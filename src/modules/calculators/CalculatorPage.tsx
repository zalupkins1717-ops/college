import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowRight, BookmarkPlus, BookOpen, Check, ChevronDown, Copy, Info, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { NumericField } from '../../shared/ui/NumericField';
import type { HistoryEntry } from '../../shared/hooks/useHistory';
import { formatNumber } from '../../shared/utils/format';
import { getCalculator, getDefaults } from './model/catalog';
import type { CalculatorId, Inputs } from './model/catalog';
import { evaluate } from './model/evaluate';
import type { Result } from './model/evaluate';
import GeometryPreview from './components/GeometryPreview';

interface Props {
  id: CalculatorId;
  onSave: (entry: Omit<HistoryEntry, 'id' | 'createdAt'>) => boolean;
  storageError: string | null;
}

export default function CalculatorPage({ id, onSave, storageError }: Props) {
  const calculator = getCalculator(id);
  const location = useLocation();
  const [inputs, setInputs] = useState<Inputs>(() => getDefaults(id));
  const [digits, setDigits] = useState(2);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);
  const [copyState, setCopyState] = useState(false);

  useEffect(() => {
    const restored = (location.state as { restore?: HistoryEntry } | null)?.restore;
    if (restored?.calculatorId === id) {
      setInputs({ ...getDefaults(id), ...restored.inputs });
      setNotice('Исходные данные восстановлены из истории');
    }
  }, [id, location.state]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const calculation = useMemo(() => {
    try { return { result: evaluate(id, inputs, digits), error: null }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : 'Проверьте исходные данные' }; }
  }, [id, inputs, digits]);

  const update = (key: string, value: string) => {
    setInputs((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  };
  const reset = () => {
    setInputs(getDefaults(id)); setSaved(false); setNotice('Восстановлены значения из примера');
  };
  const result = calculation.result;
  const summary = result ? `${result.label}: ${result.value}${result.unit ? ` ${result.unit}` : ''}` : '';
  const textResult = result ? [calculator.title, summary, ...result.metrics.map((metric) => `${metric.label}: ${metric.value} ${metric.unit ?? ''}`), result.interval ? `${result.interval.label}: ${result.interval.value}` : '', ...result.steps.map((step) => step.formula)].filter(Boolean).join('\n') : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(textResult);
      setCopyState(true); setNotice('Результат скопирован');
      setTimeout(() => setCopyState(false), 2000);
    } catch { setNotice('Не удалось скопировать. Выделите результат и скопируйте вручную.'); }
  };
  const save = () => {
    if (!result) return;
    if (onSave({ calculatorId: id, title: calculator.title, inputs, summary, details: result.metrics.map((metric) => `${metric.label}: ${metric.value} ${metric.unit ?? ''}`), unit: result.unit })) {
      setSaved(true); setNotice('Расчёт сохранён в историю');
    }
  };
  const showFormulas = () => {
    setFormulaOpen(true);
    setTimeout(() => document.getElementById('calculation-method')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const field = (key: string, label: string, symbol?: string, suffix?: string, hint?: string) => <NumericField key={key} name={key} value={inputs[key] ?? ''} onChange={(value) => update(key, value)} label={label} symbol={symbol} suffix={suffix} hint={hint} />;

  return <>
    <header className="page-heading">
      <div><h1>{calculator.title}</h1><p className="page-description">{calculator.description}</p></div>
      <button className="button button-secondary method-button" onClick={showFormulas}><BookOpen size={17} /> Формулы</button>
    </header>

    <div className="calculator-workspace">
      <div className="input-column">
        <section className="panel inputs-panel" aria-labelledby="inputs-title">
          <div className="panel-heading"><h2 id="inputs-title">Исходные данные</h2>
            {id === 'area' && <label className="unit-control"><span className="sr-only">Единица измерения</span><select aria-label="Единица измерения" value={inputs.unit} onChange={(event) => update('unit', event.target.value)}>{['мм', 'см', 'м'].map((unit) => <option key={unit}>{unit}</option>)}</select></label>}
          </div>

          {id === 'operations' && <div className="operation-selector" role="group" aria-label="Арифметическая операция">{['+', '−', '×', '÷'].map((operation) => <button key={operation} className={inputs.operation === operation ? 'selected' : ''} aria-pressed={inputs.operation === operation} onClick={() => update('operation', operation)} aria-label={{ '+': 'Сложение', '−': 'Вычитание', '×': 'Умножение', '÷': 'Деление' }[operation]}>{operation}</button>)}</div>}

          <div className="fields-grid">
            {id === 'area' && <>
              {field('a', 'Длина', 'a', inputs.unit)}{field('b', 'Ширина', 'b', inputs.unit)}
              {field('ea', 'Погрешность длины', 'εa', `± ${inputs.unit}`)}{field('eb', 'Погрешность ширины', 'εb', `± ${inputs.unit}`)}
            </>}
            {id === 'errors' && <>{field('exact', 'Точное значение', 'x')}{field('approx', 'Приближённое значение', 'x̃')}</>}
            {id === 'rounding' && <>
              {field('x', 'Исходное число', 'x')}
              <div className="numeric-field"><label htmlFor="round-digits">Знаков после запятой <span className="field-symbol">n</span></label><div className="input-wrap"><select id="round-digits" value={inputs.digits} onChange={(event) => update('digits', event.target.value)}>{Array.from({ length: 13 }, (_, index) => <option key={index} value={index}>{index}</option>)}</select></div></div>
            </>}
            {(id === 'operations' || id === 'cancellation') && <>
              {field('a', 'Первое число', 'a')}{field('b', 'Второе число', 'b')}
              {field('ea', 'Погрешность a', 'εa', '±')}{field('eb', 'Погрешность b', 'εb', '±')}
            </>}
          </div>
          {id === 'area' && <div className="tolerance-row"><div><label htmlFor="tolerance">Допуск</label></div><div className="tolerance-input"><input id="tolerance" name="tolerance" type="text" inputMode="decimal" value={inputs.tolerance} onChange={(event) => update('tolerance', event.target.value)} /><span>%</span></div></div>}
          <div className="input-footer"><span><span className="live-dot" /> Пересчёт при вводе</span><button className="button button-ghost" onClick={reset}><RotateCcw size={14} /> Сбросить</button></div>
        </section>

        {result?.geometry && <GeometryPreview {...result.geometry} />}
        {id === 'errors' && <section className="panel example-panel"><h2>Примеры</h2><div className="example-buttons"><button className="button button-secondary" onClick={() => { setInputs({ exact: '25', approx: '24.8' }); setSaved(false); }}>25 → 24,8 <ArrowRight size={14} /></button><button className="button button-secondary" onClick={() => { setInputs({ exact: '10', approx: '10.8' }); setSaved(false); }}>10 → 10,8 <ArrowRight size={14} /></button></div></section>}
        {result?.rounding && <section className="panel comparison-panel"><div className="panel-heading"><h2>Сравнение методов</h2></div><div className="table-scroll"><table><thead><tr><th>Способ</th><th>Результат</th><th>Граница Δ</th></tr></thead><tbody>{result.rounding.map((row) => <tr key={row.name}><th>{row.name}</th><td>{row.value}</td><td>{row.bound}</td></tr>)}</tbody></table></div><p className="table-note">Фактические погрешности — в блоке «Результат».</p></section>}
        {result?.cancellation && <section className="panel comparison-panel"><div className="panel-heading"><h2>Когда числа сближаются</h2></div><div className="table-scroll"><table><thead><tr><th>Число b</th><th>a − b</th><th>Погрешность r</th></tr></thead><tbody>{result.cancellation.map((row) => <tr key={row.b}><td>{row.b}</td><td>{row.value}</td><td><span className={row.relative !== null && row.relative >= 50 ? 'table-warning' : ''}>{row.relative === null ? 'Не определена' : `${formatNumber(row.relative)}%`}</span></td></tr>)}</tbody></table></div><p className="table-note">Сравнение для текущих a, εa и εb. Чем меньше разность, тем выше относительная погрешность.</p></section>}
      </div>

      <div className="result-column">
        {result ? <section className="result-panel" aria-labelledby="result-title" aria-live="polite" aria-atomic="true">
          <div className="result-heading"><h2 id="result-title">Результат</h2><span>Авторасчёт</span></div>
          <p className="result-label">{result.label}</p><div className="main-result"><span>{result.value}</span>{result.unit && <span className="result-unit">{result.unit}</span>}</div>
          <p className="result-expression">{result.expression}{result.unit ? ` ${result.unit}` : ''}</p>
          <div className="metrics-grid">{result.metrics.map((metric) => <div className="metric" key={metric.label}><p>{metric.label}</p><div>{metric.value}<span>{metric.unit}</span></div></div>)}</div>
          {result.interval && <div className="interval-result"><p>{result.interval.label}</p><strong>{result.interval.value}</strong><span className="interval-line"><i /><i /><i /></span></div>}
          {result.status && <div className={`result-status status-${result.status.kind}`}>
            {result.status.kind === 'success' ? <ShieldCheck size={19} /> : result.status.kind === 'warning' ? <TriangleAlert size={19} /> : <Info size={19} />}
            <div><strong>{result.status.title}</strong><p>{result.status.text}</p></div>
          </div>}
          <div className="result-actions"><button className="button button-primary" onClick={save} disabled={saved}>{saved ? <Check size={17} /> : <BookmarkPlus size={17} />}{saved ? 'Сохранено в историю' : 'Сохранить расчёт'}</button><button className="button icon-button" onClick={copy} aria-label="Скопировать результат" title="Скопировать результат">{copyState ? <Check size={17} /> : <Copy size={17} />}</button></div>
        </section> : <section className="result-panel invalid-result" aria-live="polite"><span className="invalid-icon"><TriangleAlert size={28} /></span><h2>Проверьте исходные данные</h2><p>{calculation.error}</p><span>Результат появится после исправления значений.</span></section>}
        {storageError && <p className="inline-error" role="alert">{storageError}</p>}
        <div className="precision-control"><span>Знаков после запятой</span><select value={digits} aria-label="Точность отображения" onChange={(event) => setDigits(Number(event.target.value))}>{[2, 3, 4, 6].map((count) => <option key={count} value={count}>{count}</option>)}</select></div>
        <p className="precision-note"><Info size={13} /> Вычисления выполняются без промежуточного округления.</p>
      </div>
    </div>

    <section className={`panel method-panel ${formulaOpen ? 'is-open' : ''}`} id="calculation-method">
      <button className="method-toggle" aria-expanded={formulaOpen} aria-controls="method-content" onClick={() => setFormulaOpen(!formulaOpen)}><span className="method-label"><BookOpen size={18} /><strong>Ход решения</strong></span><ChevronDown size={18} /></button>
      {formulaOpen && <div className="method-content" id="method-content">{result ? <MethodSteps result={result} /> : <p className="muted">Исправьте исходные данные, чтобы увидеть решение.</p>}<p className="method-footnote">r — граница относительной погрешности по номинальному результату. Δ и δ — фактические погрешности по точному значению. Границы интервалов при отображении округляются наружу.</p></div>}
    </section>
    <div className={`toast ${notice ? 'visible' : ''}`} role="status">{notice && <><Check size={16} />{notice}</>}</div>
  </>;
}

function MethodSteps({ result }: { result: Result }) {
  return <ol className="method-steps">{result.steps.map((step, index) => <li key={step.title}><span className="method-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p className="step-formula">{step.formula}</p></div></li>)}</ol>;
}

