import { fmt } from './errors';

function validatePrecision(digits: number): void {
  if (!Number.isInteger(digits) || digits < 0 || digits > 12) {
    throw new Error('Число знаков после запятой должно быть целым от 0 до 12');
  }
}

function validateFinite(...values: number[]): void {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Результат слишком велик. Уменьшите исходные значения');
  }
}

function needsScientific(value: number, digits: number): boolean {
  return value !== 0 && (Math.abs(value) >= 1e10 || Math.abs(value) < 10 ** -digits);
}

function scientific(coefficient: string, exponent: number): string {
  return `${coefficient.replace('.', ',')} × 10^${exponent < 0 ? '−' : ''}${Math.abs(exponent)}`;
}

/** Presentation only: never feed a formatted number back into a calculation. */
export function formatNumber(value: number, digits = 2): string {
  validatePrecision(digits);
  validateFinite(value);
  if (needsScientific(value, digits)) {
    const [coefficient, exponent] = value.toExponential(Math.max(2, digits)).split('e');
    return scientific(coefficient, Number(exponent));
  }
  const [integer, fraction] = fmt(value, digits).split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + (fraction ? `,${fraction}` : '');
}

export function parseNumber(raw: string, name: string): number {
  const normalized = raw.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    throw new Error(`«${name}»: введите число`);
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`«${name}»: число слишком велико`);
  if (value === 0 && /[1-9]/.test(normalized.split(/e/i)[0])) {
    throw new Error(`«${name}»: число слишком мало для точного представления`);
  }
  return value;
}

function directedInteger(value: number, direction: 'lower' | 'upper'): number {
  const nearest = Math.round(value);
  // An endpoint such as 203.01000000000002 differs from 203.01 only by
  // arithmetic noise. Avoid expanding it by a whole display unit.
  const clean = Math.abs(value - nearest) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 4
    ? nearest : value;
  return direction === 'lower' ? Math.floor(clean) : Math.ceil(clean);
}

function formatEndpoint(value: number, digits: number, direction: 'lower' | 'upper'): string {
  if (needsScientific(value, digits)) {
    const places = Math.max(2, digits);
    const [coefficient, exponentText] = value.toExponential().split('e');
    let exponent = Number(exponentText);
    const scale = 10 ** places;
    let rounded = directedInteger(Number(coefficient) * scale, direction) / scale;
    if (Math.abs(rounded) >= 10) {
      rounded /= 10;
      exponent += 1;
    }
    return scientific(rounded.toFixed(places), exponent);
  }

  const scale = 10 ** digits;
  const rounded = directedInteger(value * scale, direction) / scale;
  return formatNumber(rounded, digits);
}

export function formatInterval(min: number, max: number, digits: number): string {
  validatePrecision(digits);
  validateFinite(min, max);
  if (min > max) throw new Error('Нижняя граница диапазона не может превышать верхнюю');
  return `[${formatEndpoint(min, digits, 'lower')}; ${formatEndpoint(max, digits, 'upper')}]`;
}
