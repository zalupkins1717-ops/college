/** A nominal value and its guaranteed absolute error bound. */
export type ErrorResult = [value: number, error: number];

export interface AreaResult {
  value: number;
  error: number;
  relativeError: number;
  min: number;
  max: number;
  toleranceMin: number;
  toleranceMax: number;
  withinTolerance: boolean;
}

function finite(...values: number[]): void {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Введите конечные числовые значения');
  }
}

function finiteResult(...values: number[]): void {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Результат слишком велик. Уменьшите исходные значения');
  }
}

function precision(n: number): void {
  if (!Number.isInteger(n) || n < 0 || n > 12) {
    throw new Error('Число знаков после запятой должно быть целым от 0 до 12');
  }
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/** Decimal shifting avoids the common 1.005 × 100 floating-point rounding trap. */
function shift(value: number, places: number): number {
  const [coefficient, exponent = '0'] = String(value).split('e');
  return Number(`${coefficient}e${Number(exponent) + places}`);
}

export function roundTo(x: number, n: number): number {
  finite(x);
  precision(n);
  const scaled = shift(x, n);
  // At this magnitude a finite Number is already integral to this precision.
  if (!Number.isFinite(scaled)) return x;
  return normalizeZero(shift(Math.round(scaled), -n));
}

export function truncateTo(x: number, n: number): number {
  finite(x);
  precision(n);
  const scaled = shift(x, n);
  if (!Number.isFinite(scaled)) return x;
  return normalizeZero(shift(Math.trunc(scaled), -n));
}

/** Fixed decimal output, including for values normally rendered as 1e+21. */
export function fmt(x: number, n: number): string {
  const value = roundTo(x, n);
  if (Math.abs(value) < 1e21) return value.toFixed(n);

  const sign = value < 0 ? '-' : '';
  const [coefficient, exponent = '0'] = String(Math.abs(value)).split('e');
  const [integer, fraction = ''] = coefficient.split('.');
  const digits = integer + fraction;
  const integerDigits = integer.length + Number(exponent);
  const expanded = digits.padEnd(integerDigits, '0');
  return sign + expanded + (n === 0 ? '' : `.${'0'.repeat(n)}`);
}

export function actualErrors(exact: number, approx: number): [number, number | null] {
  finite(exact, approx);
  const absolute = Math.abs(exact - approx);
  finiteResult(absolute);
  const relative = exact === 0 ? null : (absolute / Math.abs(exact)) * 100;
  if (relative !== null) finiteResult(relative);
  return [normalizeZero(absolute), relative];
}

export function check(ea: number, eb: number): void {
  finite(ea, eb);
  if (ea < 0 || eb < 0) throw new Error('Границы погрешностей не могут быть отрицательными');
}

export function add(a: number, b: number, ea: number, eb: number): ErrorResult {
  finite(a, b);
  check(ea, eb);
  const value = a + b;
  const error = ea + eb;
  finiteResult(value, error);
  return [normalizeZero(value), normalizeZero(error)];
}

export function sub(a: number, b: number, ea: number, eb: number): ErrorResult {
  finite(a, b);
  check(ea, eb);
  const value = a - b;
  const error = ea + eb;
  finiteResult(value, error);
  return [normalizeZero(value), normalizeZero(error)];
}

export function mul(a: number, b: number, ea: number, eb: number): ErrorResult {
  finite(a, b);
  check(ea, eb);
  const value = a * b;
  const error = Math.abs(a) * eb + Math.abs(b) * ea + ea * eb;
  finiteResult(value, error);
  return [normalizeZero(value), normalizeZero(error)];
}

export function div(a: number, b: number, ea: number, eb: number): ErrorResult {
  finite(a, b);
  check(ea, eb);
  if (Math.abs(b) <= eb) throw new Error('В знаменателе может быть 0: нужно |b| > εb');
  const value = a / b;
  const error = (ea + Math.abs(value) * eb) / (Math.abs(b) - eb);
  finiteResult(value, error);
  return [normalizeZero(value), normalizeZero(error)];
}

/** Relative bound measured against the nominal result, in percent. */
export function rel(z: number, e: number): number | null {
  finite(z, e);
  if (e < 0) throw new Error('Граница погрешности не может быть отрицательной');
  if (z === 0) return null;
  const relative = (e / Math.abs(z)) * 100;
  finiteResult(relative);
  return normalizeZero(relative);
}

export function calculateArea(
  a: number,
  b: number,
  ea: number,
  eb: number,
  tolerancePercent = 2,
): AreaResult {
  finite(a, b, tolerancePercent);
  check(ea, eb);
  if (a <= 0 || b <= 0) throw new Error('Длина и ширина должны быть больше нуля');
  if (ea > a || eb > b) {
    throw new Error('Погрешность стороны не может превышать её длину');
  }
  if (tolerancePercent < 0) throw new Error('Допуск не может быть отрицательным');

  const [value, error] = mul(a, b, ea, eb);
  const relativeError = rel(value, error);
  if (relativeError === null) throw new Error('Площадь слишком мала для расчёта');
  const min = (a - ea) * (b - eb);
  const max = (a + ea) * (b + eb);
  const toleranceMin = value * (1 - tolerancePercent / 100);
  const toleranceMax = value * (1 + tolerancePercent / 100);
  finiteResult(min, max, toleranceMin, toleranceMax);

  return {
    value,
    error,
    relativeError,
    min,
    max,
    toleranceMin,
    toleranceMax,
    withinTolerance: min >= toleranceMin && max <= toleranceMax,
  };
}
