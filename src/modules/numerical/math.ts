import { compileExpression } from './parser';
import type { Axis, Coordinates } from './parser';

export type { Axis } from './parser';
export interface PlotPoint { x: number; y: number }
const axes: Axis[] = ['x', 'y', 'z'];

function centralDifference(f: (t: number) => number, x: number, requested?: number): number {
  if (!Number.isFinite(x)) throw new Error('Координата точки должна быть конечным числом.');
  if (requested !== undefined && (!Number.isFinite(requested) || requested <= 0)) {
    throw new Error('Шаг должен быть положительным конечным числом.');
  }
  const center = f(x);
  if (!Number.isFinite(center)) throw new Error('Функция не определена в заданной точке.');
  let h = requested ?? Math.max(1e-4, Math.abs(x) * Number.EPSILON * 32);

  const initialStep = h;
  if (requested === undefined && center !== 0) {
    // With a large constant offset, f(x ± h) may differ by only one representable
    // number. Enlarge a *local* stencil before comparing slopes lost to subtraction.
    const resolution = Math.abs(center) * Number.EPSILON;
    const maximumStep = Math.max(h, Math.max(1, Math.abs(x)) / 16);
    while (h < maximumStep) {
      const a = f(x - h), b = f(x + h);
      if (!Number.isFinite(a) || !Number.isFinite(b) ||
          Math.max(Math.abs(a - center), Math.abs(b - center)) > 32 * resolution) break;
      const next = Math.min(maximumStep, 2 ** Math.ceil(Math.log2(h * 4)));
      if (!(next > h) || !Number.isFinite(f(x - next)) || !Number.isFinite(f(x + next))) break;
      h = next;
    }
  }
  const enlargedForPrecision = h > initialStep;

  for (let attempt = 0; attempt < 55; attempt++) {
    const left = x - h, right = x + h, innerLeft = x - h / 2, innerRight = x + h / 2;
    if (!(left < innerLeft && innerLeft < x && x < innerRight && innerRight < right)) {
      throw new Error('Шаг слишком мал для этой точки. Увеличьте шаг.');
    }
    const a = f(left), b = f(right), c = f(innerLeft), d = f(innerRight);
    if (![a, b, c, d].every(Number.isFinite)) {
      if (requested !== undefined) {
        throw new Error('Функция не определена с обеих сторон точки при этом шаге. Уменьшите шаг или измените точку.');
      }
      h = x !== 0 ? Math.min(h / 2, Math.abs(x) / 4) : h / 2;
      continue;
    }

    const coarse = (b - a) / (right - left), fine = (d - c) / (innerRight - innerLeft);
    if (!Number.isFinite(coarse) || !Number.isFinite(fine)) throw new Error('Производная слишком велика.');
    const gap = Math.abs((b - center) / (right - x) - (center - a) / (x - left));
    const innerGap = Math.abs((d - center) / (innerRight - x) - (center - c) / (x - innerLeft));
    // For a smooth curve the one-sided slopes approach each other as the step shrinks.
    const noise = 24 * Number.EPSILON * Math.max(Math.abs(center), Math.abs(a), Math.abs(b)) / h;
    const scale = Math.max(Math.abs(coarse), Math.abs(fine), gap, innerGap);
    if (innerGap > Math.max(noise, 1e-6 * scale) && innerGap >= 0.9999 * gap) {
      if (requested === undefined && !enlargedForPrecision && attempt < 6) { h /= 2; continue; }
      throw new Error('Левая и правая оценки не сходятся. Проверьте, существует ли производная в точке.');
    }
    if (requested !== undefined) return coarse;
    if (Math.abs(coarse - fine) <= Math.max(1e-9, 1e-7 * Math.abs(fine), noise)) {
      const extrapolated = fine + (fine - coarse) / 3;
      if (!Number.isFinite(extrapolated)) throw new Error('Производная слишком велика.');
      return extrapolated;
    }
    h /= 2;
  }
  throw new Error('Не удалось получить устойчивую двустороннюю оценку. Измените точку или укажите шаг.');
}

export function derivative(expression: string, x: number, h?: number): number {
  const f = compileExpression(expression, ['x']);
  return centralDifference(t => f({ x: t, y: 0, z: 0 }), x, h);
}

export function partialDerivative(expression: string, axis: Axis, point: Coordinates, h?: number): number {
  if (!axes.includes(axis)) throw new Error('Выберите переменную x, y или z.');
  if (!axes.every(key => Number.isFinite(point[key]))) throw new Error('Введите конечные координаты точки.');
  const f = compileExpression(expression, axes);
  const sample = { ...point };
  return centralDifference(t => {
    sample[axis] = t;
    return f(sample);
  }, point[axis], h);
}

export function plotFunction(expression: string, min: number, max: number): PlotPoint[][] {
  const span = max - min;
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(span) || span <= 0) {
    throw new Error('Задайте конечный интервал, в котором левая граница меньше правой.');
  }
  const f = compileExpression(expression, ['x']);
  const sample = (x: number): PlotPoint => ({ x, y: f({ x, y: 0, z: 0 }) });
  const intervals = 320;
  if (min + span / intervals === min || max - span / intervals === max) {
    throw new Error('Интервал слишком узок для таких значений x.');
  }
  const grid = Array.from({ length: intervals + 1 }, (_, i) => sample(i === intervals ? max : min + span * (i / intervals)));
  const heights = grid.map(point => point.y).filter(Number.isFinite).sort((a, b) => a - b);
  const low = heights[Math.floor(heights.length * 0.1)] ?? 0;
  const high = heights[Math.floor(heights.length * 0.9)] ?? 0;
  const tolerance = Math.max(high * 0.001 - low * 0.001, Math.abs(high) * Number.EPSILON * 8);

  const segments: PlotPoint[][] = [];
  let current: PlotPoint[] = [];
  function append(point: PlotPoint) {
    if (!Number.isFinite(point.y)) { current = []; return; }
    if (!current.length) segments.push(current);
    if (current[current.length - 1]?.x !== point.x) current.push(point);
  }
  function trace(a: PlotPoint, b: PlotPoint, depth: number) {
    const mid = sample(a.x + (b.x - a.x) / 2);
    const finiteCount = Number.isFinite(a.y) ? 1 : 0;
    const valid = finiteCount + Number(Number.isFinite(mid.y)) + Number(Number.isFinite(b.y));
    if (!valid) { current = []; return; }
    const midError = Math.abs(mid.y - (a.y / 2 + b.y / 2));
    const smooth = valid === 3 && midError <= Math.max(tolerance, Math.abs(a.y * 0.15 - b.y * 0.15));
    if (smooth) { append(a); append(b); return; }
    if (depth < 7 && a.x < mid.x && mid.x < b.x) {
      trace(a, mid, depth + 1);
      trace(mid, b, depth + 1);
    } else {
      // No smooth connection was resolved (e.g. a pole between sampled x values).
      append(a);
      current = [];
      append(b);
    }
  }
  for (let i = 0; i < intervals; i++) trace(grid[i], grid[i + 1], 0);
  if (!segments.length) throw new Error('На этом интервале не найдено действительных значений функции.');
  return segments;
}
