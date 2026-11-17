import { describe, expect, it } from 'vitest';
import {
  actualErrors,
  add,
  calculateArea,
  check,
  div,
  fmt,
  mul,
  rel,
  roundTo,
  sub,
  truncateTo,
} from './errors';

describe('actualErrors', () => {
  it('reproduces both examples from task 1', () => {
    const first = actualErrors(25, 24.8);
    expect(first[0]).toBeCloseTo(0.2, 12);
    expect(first[1]).toBeCloseTo(0.8, 12);
    const second = actualErrors(10, 10.8);
    expect(second[0]).toBeCloseTo(0.8, 12);
    expect(second[1]).toBeCloseTo(8, 12);
  });

  it('uses the absolute value of a negative exact value', () => {
    expect(actualErrors(-10, -9)).toEqual([1, 10]);
  });

  it('returns an undefined relative error for exact zero', () => {
    expect(actualErrors(0, 2)).toEqual([2, null]);
    expect(actualErrors(0, 0)).toEqual([0, null]);
  });

  it('rejects non-finite input and an overflowing difference', () => {
    expect(() => actualErrors(NaN, 1)).toThrow();
    expect(() => actualErrors(1, Infinity)).toThrow();
    expect(() => actualErrors(Number.MAX_VALUE, -Number.MAX_VALUE)).toThrow();
  });
});

describe('decimal precision and presentation', () => {
  it('reproduces rounding and truncation from task 2', () => {
    expect(roundTo(17.3862, 2)).toBe(17.39);
    expect(truncateTo(17.3862, 2)).toBe(17.38);
    expect(actualErrors(17.3862, roundTo(17.3862, 2))[0]).toBeCloseTo(0.0038, 12);
    expect(actualErrors(17.3862, truncateTo(17.3862, 2))[0]).toBeCloseTo(0.0062, 12);
  });

  it('rounds decimal half steps without the multiplication artefact', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1);
  });

  it('truncates toward zero for negative values', () => {
    expect(truncateTo(-17.3862, 2)).toBe(-17.38);
  });

  it('formats fixed decimals and normalizes negative zero', () => {
    expect(fmt(3, 2)).toBe('3.00');
    expect(fmt(1.23456, 3)).toBe('1.235');
    expect(fmt(0.0000001, 8)).toBe('0.00000010');
    expect(fmt(-0.00001, 2)).toBe('0.00');
    expect(fmt(-0, 0)).toBe('0');
  });

  it('expands scientific notation and handles large finite values', () => {
    expect(fmt(1e21, 2)).toBe('1000000000000000000000.00');
    expect(fmt(-1.23e22, 0)).toBe('-12300000000000000000000');
    expect(roundTo(Number.MAX_VALUE, 12)).toBe(Number.MAX_VALUE);
    expect(truncateTo(Number.MAX_VALUE, 12)).toBe(Number.MAX_VALUE);
  });

  it.each([-1, 13, 1.5, NaN, Infinity])('rejects invalid precision %s', (n) => {
    expect(() => fmt(1, n)).toThrow();
    expect(() => roundTo(1, n)).toThrow();
    expect(() => truncateTo(1, n)).toThrow();
  });

  it('rejects non-finite formatting and precision inputs', () => {
    expect(() => fmt(Infinity, 2)).toThrow();
    expect(() => roundTo(NaN, 2)).toThrow();
    expect(() => truncateTo(-Infinity, 2)).toThrow();
  });
});

describe('arithmetic error propagation', () => {
  it('adds absolute bounds for addition and subtraction', () => {
    expect(add(12, 4, 0.1, 0.1)).toEqual([16, 0.2]);
    expect(sub(12, 4, 0.1, 0.1)).toEqual([8, 0.2]);
    expect(rel(16, 0.2)).toBe(1.25);
    expect(rel(8, 0.2)).toBe(2.5);
  });

  it('keeps the second-order product term', () => {
    const [value, error] = mul(6, 2, 0.1, 0.1);
    expect(value).toBe(12);
    expect(error).toBeCloseTo(0.81, 12);
    expect(mul(12, 4, 0.1, 0.1)[1]).toBeCloseTo(1.61, 12);
  });

  it('uses operand magnitudes for signed multiplication', () => {
    expect(mul(-6, 2, 0.1, 0.1)[1]).toBeCloseTo(0.81, 12);
  });

  it('computes the guaranteed division bound without display rounding', () => {
    const [value, error] = div(12, 4, 0.1, 0.1);
    expect(value).toBe(3);
    expect(error).toBeCloseTo(0.10256410256410257, 14);
    expect(rel(value, error)).toBeCloseTo(3.418803418803419, 12);
  });

  it.each([0, 0.1, -0.1])('rejects denominator interval containing zero for b=%s', (b) => {
    expect(() => div(1, b, 0.1, 0.1)).toThrow(/знаменателе/);
  });

  it('allows a strictly negative denominator interval', () => {
    expect(div(12, -4, 0.1, 0.1)[0]).toBe(-3);
    expect(div(12, -4, 0.1, 0.1)[1]).toBeCloseTo(0.10256410256410257, 14);
  });

  it('shows cancellation amplifying relative error', () => {
    const relativeErrors = [2, 9, 9.8].map((b) => {
      const [value, error] = sub(10, b, 0.1, 0.1);
      expect(error).toBe(0.2);
      return rel(value, error);
    });
    expect(relativeErrors[0]).toBe(2.5);
    expect(relativeErrors[1]).toBe(20);
    expect(relativeErrors[2]).toBeCloseTo(100, 10);
  });

  it('handles zero nominal results and zero error bounds', () => {
    expect(rel(0, 0.2)).toBeNull();
    expect(rel(0, 0)).toBeNull();
    expect(rel(-2, 0.1)).toBe(5);
    expect(add(1, 2, 0, 0)).toEqual([3, 0]);
  });

  it.each([add, sub, mul, div])('rejects negative and non-finite bounds', (operation) => {
    expect(() => operation(1, 2, -0.1, 0.1)).toThrow();
    expect(() => operation(1, 2, 0.1, NaN)).toThrow();
    expect(() => operation(Infinity, 2, 0.1, 0.1)).toThrow();
  });

  it('rejects overflowing results and relative bounds', () => {
    expect(() => add(Number.MAX_VALUE, Number.MAX_VALUE, 0, 0)).toThrow();
    expect(() => sub(Number.MAX_VALUE, -Number.MAX_VALUE, 0, 0)).toThrow();
    expect(() => mul(Number.MAX_VALUE, 2, 0, 0)).toThrow();
    expect(() => div(Number.MAX_VALUE, 0.5, 0, 0)).toThrow();
    expect(() => rel(Number.MIN_VALUE, 1)).toThrow();
  });

  it('validates the standalone bound helpers', () => {
    expect(() => check(-1, 0)).toThrow();
    expect(() => check(0, Infinity)).toThrow();
    expect(() => rel(1, -1)).toThrow();
  });
});

describe('rectangle area and tolerance', () => {
  it('reproduces task 4 using endpoint products', () => {
    const result = calculateArea(20, 10, 0.1, 0.1);
    expect(result.value).toBe(200);
    expect(result.error).toBeCloseTo(3.01, 12);
    expect(result.relativeError).toBeCloseTo(1.505, 12);
    expect(result.min).toBeCloseTo(197.01, 12);
    expect(result.max).toBeCloseTo(203.01, 12);
    expect(result.toleranceMin).toBe(196);
    expect(result.toleranceMax).toBe(204);
    expect(result.withinTolerance).toBe(true);
  });

  it('reports when the allowed tolerance is exceeded', () => {
    expect(calculateArea(20, 10, 0.1, 0.1, 1).withinTolerance).toBe(false);
  });

  it('accepts exact measurements with zero tolerance', () => {
    expect(calculateArea(20, 10, 0, 0, 0).withinTolerance).toBe(true);
  });

  it('permits a zero lower endpoint but rejects negative physical lengths', () => {
    expect(calculateArea(1, 2, 1, 0).min).toBe(0);
    expect(() => calculateArea(1, 2, 1.1, 0)).toThrow();
    expect(() => calculateArea(1, 2, 0, 2.1)).toThrow();
  });

  it('rejects zero and negative dimensions and invalid tolerance', () => {
    expect(() => calculateArea(0, 1, 0, 0)).toThrow();
    expect(() => calculateArea(-1, 1, 0, 0)).toThrow();
    expect(() => calculateArea(1, 1, 0, 0, -1)).toThrow();
    expect(() => calculateArea(1, 1, 0, 0, NaN)).toThrow();
  });
});
