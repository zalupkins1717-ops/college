import { derivative, partialDerivative, plotFunction } from './math';
import { recordCalculation } from '../../shared/history/recordCalculation';
import { parseNumber } from '../../shared/utils/format';
import type { Recorded } from '../../shared/history/recordCalculation';
import type { HistoryEntry } from '../../shared/history/database';

export const numericalTitles = {
  derivative: 'Производная',
  partial: 'Частная производная',
  plot: 'График функции',
} as const;
export type NumericalMode = keyof typeof numericalTitles;
export const isNumericalMode = (value: string): value is NumericalMode =>
  Object.hasOwn(numericalTitles, value);

type Inputs = Record<string, string>;
export type NumericalOutput = {
  summary: string;
  details: string[];
  value?: number;
  segments?: Array<Array<{ x: number; y: number }>>;
  warning?: string;
};
const format = (value: number) => Number(value.toPrecision(10)).toLocaleString('ru-RU', {
  maximumSignificantDigits: 10, useGrouping: false,
  notation: value !== 0 && (Math.abs(value) < 1e-6 || Math.abs(value) >= 1e10) ? 'scientific' : 'standard',
});

export function previewNumerical(mode: NumericalMode, inputs: Inputs): NumericalOutput {
  const expression = (inputs.expression ?? '').trim();
  if (!expression) throw new Error('Введите формулу функции.');
  if (mode === 'plot') {
    const min = parseNumber(inputs.min ?? '', 'Начало интервала');
    const max = parseNumber(inputs.max ?? '', 'Конец интервала');
    const segments = plotFunction(expression, min, max);
    if (!segments.length) throw new Error('На этом интервале нет действительных значений функции.');
    return { summary: 'f(x) = ' + expression, details: [
      'x ∈ [' + format(min) + ', ' + format(max) + ']',
      'Точек на графике: ' + segments.reduce((sum, segment) => sum + segment.length, 0),
    ], segments };
  }
  const h = inputs.h?.trim() ? parseNumber(inputs.h, 'Шаг h') : undefined;
  const x = parseNumber(inputs.x ?? '', 'x');
  let value: number;
  let point = 'x = ' + format(x);
  let symbol = 'f′(x)';
  if (mode === 'derivative') value = derivative(expression, x, h);
  else {
    if (inputs.axis !== 'x' && inputs.axis !== 'y' && inputs.axis !== 'z') throw new Error('Выберите переменную x, y или z.');
    const y = parseNumber(inputs.y ?? '', 'y'), z = parseNumber(inputs.z ?? '', 'z');
    value = partialDerivative(expression, inputs.axis, { x, y, z }, h);
    point += ', y = ' + format(y) + ', z = ' + format(z);
    symbol = '∂f/∂' + inputs.axis;
  }
  return { value, summary: symbol + ' ≈ ' + format(value), details: [
    'f = ' + expression, point, h === undefined ? 'Автоматический шаг' : 'h = ' + format(h),
  ] };
}

class NumericalMethods {
  @recordCalculation
  async calculate(mode: NumericalMode, inputs: Inputs): Promise<Recorded<NumericalOutput>> {
    const result = previewNumerical(mode, inputs);
    const numericalResult: HistoryEntry['numericalResult'] =
      result.segments ? { segments: result.segments } : { value: result.value };
    return { result, entry: { calculatorId: mode, title: numericalTitles[mode], inputs: { ...inputs },
      summary: result.summary, details: result.details, unit: '', numericalResult } };
  }
}

const methods = new NumericalMethods();
export async function runNumerical(mode: NumericalMode, inputs: Inputs): Promise<NumericalOutput> {
  const { result, warning } = await methods.calculate(mode, inputs);
  return warning ? { ...result, warning } : result;
}
