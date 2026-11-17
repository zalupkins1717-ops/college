import { actualErrors, add, sub, mul, div, rel, roundTo, truncateTo, calculateArea } from '../../../shared/utils/errors';
import { formatInterval, formatNumber, parseNumber } from '../../../shared/utils/format';
import type { CalculatorId, Inputs } from './catalog';

export interface Metric { label: string; value: string; unit?: string; }
export interface Step { title: string; formula: string; }
export interface Result {
  label: string; value: string; unit: string; expression: string;
  metrics: Metric[]; steps: Step[];
  interval?: { label: string; value: string; };
  status?: { kind: 'success' | 'warning' | 'neutral'; title: string; text: string; };
  geometry?: { a: number; b: number; unit: string; };
  rounding?: { name: string; value: string; error: string; bound: string; }[];
  cancellation?: { b: string; value: string; error: string; relative: number | null; }[];
}

const operations = {
  '+': { run: add, symbol: '+', formula: 'ε = εa + εb' },
  '−': { run: sub, symbol: '−', formula: 'ε = εa + εb' },
  '×': { run: mul, symbol: '×', formula: 'ε = |a| · εb + |b| · εa + εa · εb' },
  '÷': { run: div, symbol: '÷', formula: 'ε = (εa + |a / b| · εb) / (|b| − εb)' },
};

export function evaluate(id: CalculatorId, inputs: Inputs, digits: number): Result {
  if (!Number.isInteger(digits) || digits < 0 || digits > 12) {
    throw new Error('Точность отображения должна быть целым числом от 0 до 12');
  }
  const n = (key: string, label: string) => parseNumber(inputs[key] ?? '', label);
  const f = (value: number, precision = digits) => formatNumber(value, precision);
  const r = (value: number | null) => value === null ? 'Не определена' : f(value);
  if (id === 'area') {
    const a = n('a', 'Длина'), b = n('b', 'Ширина'), ea = n('ea', 'Погрешность длины'), eb = n('eb', 'Погрешность ширины');
    const tolerance = n('tolerance', 'Допуск');
    const [toleranceCoefficient, toleranceExponent = '0'] = String(tolerance).split('e');
    const tolerancePlaces = Math.min(12, Math.max(0, (toleranceCoefficient.split('.')[1]?.length ?? 0) - Number(toleranceExponent)));
    const toleranceLabel = f(tolerance, tolerancePlaces);
    const unit = ['мм', 'см', 'м'].includes(inputs.unit) ? inputs.unit : 'см';
    const area = calculateArea(a, b, ea, eb, tolerance);
    return {
      label: 'Площадь прямоугольника', value: f(area.value), unit: `${unit}²`, expression: `${f(a)} × ${f(b)} = ${f(area.value)}`,
      metrics: [{ label: 'Абсолютная погрешность', value: f(area.error), unit: `${unit}²` }, { label: 'Относительная погрешность', value: r(area.relativeError), unit: '%' }],
      interval: { label: 'Возможный диапазон площади', value: `${formatInterval(area.min, area.max, digits)} ${unit}²` },
      status: { kind: area.withinTolerance ? 'success' : 'warning', title: area.withinTolerance ? `В пределах допуска ±${toleranceLabel}%` : `Допуск ±${toleranceLabel}% превышен`,
        text: `Допустимый диапазон: ${formatInterval(area.toleranceMin, area.toleranceMax, digits)} ${unit}²` },
      geometry: { a, b, unit },
      steps: [
        { title: 'Находим номинальную площадь', formula: `S = a · b = ${f(a)} · ${f(b)} = ${f(area.value)} ${unit}²` },
        { title: 'Оцениваем границу погрешности', formula: `εS = |a| · εb + |b| · εa + εa · εb = ${f(area.error)} ${unit}²` },
        { title: 'Вычисляем относительную погрешность', formula: `r = εS / |S| · 100% = ${f(area.relativeError)}%` },
        { title: 'Проверяем крайние значения', formula: `Smin = (a − εa)(b − εb); Smax = (a + εa)(b + εb)` },
      ],
    };
  }
  if (id === 'errors') {
    const exact = n('exact', 'Точное значение'), approx = n('approx', 'Приближённое значение');
    const [absolute, relative] = actualErrors(exact, approx);
    return {
      label: 'Абсолютная погрешность', value: f(absolute, Math.max(2, digits)), unit: '', expression: `|${f(exact)} − ${f(approx)}| = ${f(absolute)}`,
      metrics: [{ label: 'Относительная погрешность', value: r(relative), unit: relative === null ? '' : '%' }, { label: 'Точное значение', value: f(exact) }],
      interval: { label: 'Приближённое значение', value: f(approx) },
      status: { kind: relative === null ? 'neutral' : 'success', title: relative === null ? 'Точное значение равно нулю' : 'Погрешности рассчитаны', text: relative === null ? 'Относительная погрешность не определена: деление на ноль.' : 'Относительная погрешность рассчитана относительно точного значения.' },
      steps: [{ title: 'Находим абсолютное отклонение', formula: `Δ = |x − x̃| = ${f(absolute, Math.max(4, digits))}` }, { title: 'Сравниваем с точным значением', formula: relative === null ? 'δ = Δ / |x| · 100% — не определена при x = 0' : `δ = Δ / |x| · 100% = ${f(relative)}%` }],
    };
  }
  if (id === 'rounding') {
    const x = n('x', 'Исходное число'), places = n('digits', 'Знаки после запятой');
    const rounded = roundTo(x, places), truncated = truncateTo(x, places);
    const [roundError] = actualErrors(x, rounded), [truncateError] = actualErrors(x, truncated);
    const roundBound = 0.5 * 10 ** -places, truncateBound = 10 ** -places;
    return {
      label: 'Результат округления', value: f(rounded, places), unit: '', expression: `${formatNumber(x, Math.min(12, Math.max(places + 2, 4)))} → ${f(rounded, places)}`,
      metrics: [{ label: 'Погрешность округления', value: f(roundError, Math.min(12, places + 2)) }, { label: 'Погрешность усечения', value: f(truncateError, Math.min(12, places + 2)) }],
      interval: { label: 'Результат усечения', value: f(truncated, places) },
      status: { kind: 'neutral', title: `Знаков после запятой: ${places}`, text: 'Усечение направлено к нулю. Ровно половина округляется в сторону большего числа.' },
      rounding: [
        { name: 'Округление', value: f(rounded, places), error: f(roundError, Math.min(12, places + 2)), bound: `≤ ${f(roundBound, Math.min(12, places + 1))}` },
        { name: 'Усечение', value: f(truncated, places), error: f(truncateError, Math.min(12, places + 2)), bound: `< ${f(truncateBound, places)}` },
      ],
      steps: [{ title: 'Округляем к ближайшему числу', formula: `round(x · 10ⁿ) / 10ⁿ = ${f(rounded, places)}` }, { title: 'Усекаем дробную часть', formula: `trunc(x · 10ⁿ) / 10ⁿ = ${f(truncated, places)}` }, { title: 'Оцениваем максимальные погрешности', formula: `Δокр ≤ 0,5 · 10⁻ⁿ; Δусеч < 10⁻ⁿ` }],
    };
  }
  const a = n('a', 'Первое число'), b = n('b', 'Второе число'), ea = n('ea', 'Погрешность a'), eb = n('eb', 'Погрешность b');
  const opKey = id === 'cancellation' ? '−' : inputs.operation;
  if (!Object.hasOwn(operations, opKey)) throw new Error('Выберите арифметическую операцию');
  const operation = operations[opKey as keyof typeof operations];
  if (!operation) throw new Error('Выберите арифметическую операцию');
  const [value, error] = operation.run(a, b, ea, eb);
  const relative = rel(value, error);
  // Calculate additive endpoints from the input intervals. In particular,
  // (10 − 0.1) − (9.8 + 0.1) is exactly zero in Number arithmetic, whereas
  // (10 − 9.8) − (0.1 + 0.1) introduces a spurious negative residual.
  const [intervalMin, intervalMax] = opKey === '+'
    ? [(a - ea) + (b - eb), (a + ea) + (b + eb)]
    : opKey === '−'
      ? [(a - ea) - (b + eb), (a + ea) - (b - eb)]
      : [value - error, value + error];
  const result: Result = {
    label: id === 'cancellation' ? 'Разность значений' : 'Результат операции', value: f(value), unit: '', expression: `${f(a)} ${operation.symbol} ${f(b)} = ${f(value)}`,
    metrics: [{ label: 'Абсолютная погрешность', value: f(error, Math.max(3, digits)) }, { label: 'Относительная погрешность', value: r(relative), unit: relative === null ? '' : '%' }],
    interval: { label: 'Возможный диапазон результата', value: formatInterval(intervalMin, intervalMax, digits) },
    status: relative === null ? { kind: 'neutral', title: 'Результат равен нулю', text: 'Относительная погрешность не определена. Абсолютная погрешность остаётся применимой.' }
      : relative >= 50 ? { kind: 'warning', title: 'Высокая относительная погрешность', text: 'Малый результат чувствителен к погрешностям исходных значений.' }
      : { kind: 'success', title: 'Погрешности учтены', text: 'Граница рассчитана для всех допустимых значений исходных величин.' },
    steps: [{ title: 'Выполняем операцию', formula: `z = a ${operation.symbol} b = ${f(value)}` }, { title: 'Находим границу абсолютной погрешности', formula: `${operation.formula} = ${f(error, Math.max(4, digits))}` }, { title: 'Вычисляем относительную погрешность', formula: relative === null ? 'r = ε / |z| · 100% — не определена при z = 0' : `r = ε / |z| · 100% = ${f(relative)}%` }],
  };
  if (id === 'cancellation') {
    result.cancellation = [2, 9, 9.8].map((other) => {
      const [z, e] = sub(a, other, ea, eb);
      return { b: f(other), value: f(z), error: f(e), relative: rel(z, e) };
    });
  }
  return result;
}
