import { describe, expect, it } from 'vitest';
import { formatInterval, formatNumber, parseNumber } from '../../../shared/utils/format';
import { getDefaults } from './catalog';
import { evaluate } from './evaluate';

describe('calculator presentation and evaluation', () => {
  it.each(['area', 'errors', 'rounding', 'operations', 'cancellation'] as const)(
    'evaluates the default %s example without non-finite summaries', (id) => {
      const result = evaluate(id, getDefaults(id), 2);
      expect(result.value).not.toBe('—');
      expect(JSON.stringify(result)).not.toMatch(/Infinity|NaN|undefined/);
      expect(result.steps.length).toBeGreaterThan(0);
    },
  );

  it.each([10, 11, 12])('supports rounding to %s places without exceeding display precision', (digits) => {
    const result = evaluate('rounding', { x: '17.386212345678', digits: String(digits) }, 2);
    expect(result.value).toBe(formatNumber(Number(result.value.replace(',', '.')), digits));
    expect(result.expression).toContain('→');
  });

  it('keeps decimal tolerance in both success and warning titles', () => {
    const inputs = { ...getDefaults('area'), tolerance: '1,75' };
    expect(evaluate('area', inputs, 2).status?.title).toBe('В пределах допуска ±1,75%');
    expect(evaluate('area', { ...inputs, tolerance: '1.25' }, 2).status?.title).toBe('Допуск ±1,25% превышен');
  });

  it.each(['', ' ', '+', '-', ',', '.', '1e', '1e-', '1,2,3'])('rejects incomplete or malformed input %j', (raw) => {
    expect(() => parseNumber(raw, 'Поле')).toThrow(/Поле/);
    expect(() => evaluate('errors', { exact: raw, approx: '1' }, 2)).toThrow();
  });

  it('accepts decimal comma and exponent notation but rejects overflow and underflow', () => {
    expect(parseNumber(' -1,25e2 ', 'Поле')).toBe(-125);
    expect(parseNumber('0e-999', 'Поле')).toBe(0);
    expect(() => parseNumber('1e999', 'Поле')).toThrow(/велико/);
    expect(() => parseNumber('1e-999', 'Поле')).toThrow(/мало/);
  });

  it.each(['0', '0.1', '-0.1'])('rejects division when the denominator interval contains zero (%s)', (b) => {
    expect(() => evaluate('operations', { a: '1', b, ea: '0.1', eb: '0.1', operation: '÷' }, 2)).toThrow(/знаменателе/);
  });

  it.each(['', 'unknown', 'toString', '__proto__'])('rejects invalid operation %j with a useful error', (operation) => {
    expect(() => evaluate('operations', { ...getDefaults('operations'), operation }, 2)).toThrow('Выберите арифметическую операцию');
  });

  it('rejects an overflowing interval even when value and error are finite', () => {
    expect(() => evaluate('operations', { a: '1e308', b: '0', ea: '1e308', eb: '0', operation: '+' }, 2)).toThrow(/велик/);
  });

  it('computes the cancellation interval from input endpoints without a false negative residual', () => {
    const result = evaluate('cancellation', getDefaults('cancellation'), 2);
    expect(result.interval?.value).toBe('[0,00; 0,40]');
  });

  it('preserves an actual small result instead of suppressing every small interval endpoint', () => {
    const result = evaluate('cancellation', { a: '1e-10', b: '0', ea: '0', eb: '0' }, 2);
    expect(result.interval?.value).toBe('[1,00 × 10^−10; 1,00 × 10^−10]');
  });

  it.each([
    ['+', '[15,80; 16,20]'],
    ['−', '[7,80; 8,20]'],
    ['×', '[46,39; 49,61]'],
    ['÷', '[2,89; 3,11]'],
  ])('preserves the guaranteed result interval for operation %s', (operation, interval) => {
    const result = evaluate('operations', { ...getDefaults('operations'), operation }, 2);
    expect(result.interval?.value).toBe(interval);
  });

  it('explains undefined relative error at a zero exact value', () => {
    const result = evaluate('errors', { exact: '0', approx: '1' }, 2);
    expect(result.metrics[0].value).toBe('Не определена');
    expect(result.metrics[0].unit).toBe('');
    expect(result.status?.kind).toBe('neutral');
  });

  it.each([-1, 13, 1.5, NaN])('rejects invalid global display precision %s', (digits) => {
    expect(() => evaluate('area', getDefaults('area'), digits)).toThrow(/Точность/);
  });
});

describe('finite and conservative interval presentation', () => {
  it('removes arithmetic noise at exact decimal endpoints', () => {
    expect(formatInterval(197.01, 203.01000000000002, 2)).toBe('[197,01; 203,01]');
  });

  it('rounds endpoints outward for positive and negative bounds', () => {
    expect(formatInterval(1.234, 1.235, 2)).toBe('[1,23; 1,24]');
    expect(formatInterval(-1.235, -1.234, 2)).toBe('[-1,24; -1,23]');
  });

  it('keeps very large finite endpoints finite without multiplying them by the display scale', () => {
    expect(formatInterval(1.2345e308, 1.2346e308, 2)).toBe('[1,23 × 10^308; 1,24 × 10^308]');
    expect(formatInterval(-1.2346e308, -1.2345e308, 2)).toBe('[-1,24 × 10^308; -1,23 × 10^308]');
  });

  it('rounds scientific endpoints outward instead of applying nearest rounding', () => {
    expect(formatInterval(0.000012345, 0.000012346, 2)).toBe('[1,23 × 10^−5; 1,24 × 10^−5]');
  });

  it('throws on non-finite output rather than silently printing an em dash', () => {
    expect(() => formatNumber(Infinity)).toThrow();
    expect(() => formatInterval(0, Infinity, 2)).toThrow();
    expect(() => formatInterval(NaN, 1, 2)).toThrow();
    expect(() => formatInterval(2, 1, 2)).toThrow();
  });
});
