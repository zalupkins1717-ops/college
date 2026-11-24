import { describe, expect, it } from 'vitest';
import { derivative, partialDerivative, plotFunction } from './math';
import { compileExpression } from './parser';

const point = { x: 2, y: 3, z: 4 };

describe('выражения', () => {
  it.each([
    ['-2^2', -4], ['(-2)^2', 4], ['2^3^2', 512], ['2^-3', 0.125],
    ['2(x + y) + 3z', 22], ['1e-3 + 0,5', 0.501], ['sin(π/2) + ln(e) + log(100)', 4],
    ['cos(0) + exp(0) + sqrt(9) + abs(-1)', 6],
  ])('%s', (formula, value) => {
    expect(compileExpression(formula, ['x','y','z'])(point)).toBeCloseTo(Number(value), 12);
  });
  it.each(['', 'sqrt()', 'x+', '(x', 'foo(x)', 'x=1', '1 2', 'constructor(1)', 'Math.sin(x)'])('отклоняет %j', formula => {
    expect(() => compileExpression(formula, ['x'])).toThrow();
  });
  it('сохраняет неопределённость внутренней операции', () => {
    expect(compileExpression('(1/0)^0', ['x'])(point)).toBeNaN();
  });
});

describe('численные производные', () => {
  it.each([
    ['x^3', 2, 12], ['sin(x)', 0, 1], ['3', 1, 0], ['x^2', 0, 0],
    ['exp(x)', 1, Math.E], ['ln(x)', 1, 1], ['abs(x)', -2, -1], ['x^3', 0, 0],
  ])('производная %s в %s', (f, x, want) => {
    expect(derivative(String(f), Number(x))).toBeCloseTo(Number(want), 6);
  });
  it('сохраняет точность при большом постоянном слагаемом', () => {
    expect(derivative('1e12 + x', 0)).toBeCloseTo(1, 7);
    expect(derivative('1e12 + x^2', 0)).toBeCloseTo(0, 7);
    expect(derivative('1e12', 0)).toBe(0);
    expect(() => derivative('1e12 + abs(x)', 0)).toThrow();
    const step = 1e-4;
    expect(derivative('1e12 + x', 0, step)).toBe(((1e12 + step) - (1e12 - step)) / (2 * step));
  });
  it('подбирает шаг возле границы области', () => {
    expect(derivative('ln(x)', 1e-12) / 1e12).toBeCloseTo(1, 6);
  });
  it('использует заданный шаг центральной разности', () => {
    expect(derivative('x^3', 2, 0.1)).toBeCloseTo(12.01, 9);
  });
  it('меняет только выбранную координату', () => {
    const f = 'x^2*y + sin(z)';
    expect(partialDerivative(f, 'x', point)).toBeCloseTo(12, 7);
    expect(partialDerivative(f, 'y', point)).toBeCloseTo(4, 7);
    expect(partialDerivative(f, 'z', point)).toBeCloseTo(Math.cos(4), 7);
    expect(point).toEqual({x: 2, y: 3, z: 4});
  });
  it.each([
    ['abs(x)',0,undefined], ['sqrt(x)',0,undefined], ['1/x',0,undefined],
    ['x+y',1,undefined], ['x^2',1,0], ['x',1,-0.1], ['x',1,1e-30],
    ['ln(x)',1,2], ['x', NaN, undefined],
  ])('сообщает об ошибке для %s', (f, x, h) => {
    expect(() => derivative(String(f), Number(x), h as number | undefined)).toThrow();
  });
});

describe('данные графика', () => {
  it('линейная функция непрерывна и включает обе границы', () => {
    const lines = plotFunction('2x+1', -2, 3);
    expect(lines).toHaveLength(1);
    expect(lines[0][0]).toEqual({x:-2, y:-3});
    expect(lines[0].at(-1)).toEqual({x:3, y:7});
  });
  it.each([['1/x',0], ['1/(x-0.013)',0.013], ['1/(x-0.013)^2',0.013], ['tan(x)',Math.PI/2]])('не соединяет ветви %s через полюс', (formula, pole) => {
    const lines = plotFunction(String(formula), -2, 2);
    const x = Number(pole);
    expect(lines.some(line => line[0].x < x && line.at(-1)!.x > x)).toBe(false);
    expect(lines.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
  it('обрезает недействительную часть области sqrt(x)', () => {
    const lines = plotFunction('sqrt(x)', -1, 1);
    expect(lines.flat().every(p => p.x >= 0)).toBe(true);
    expect(lines.flat().some(p => p.x === 0)).toBe(true);
  });
  it.each([['sqrt(-1)',-1,1], ['x',1,1], ['x',-Infinity,1], ['y',0,1]])('обрабатывает неверный график %s', (f, a, b) => {
    expect(() => plotFunction(String(f), Number(a), Number(b))).toThrow();
  });
});
