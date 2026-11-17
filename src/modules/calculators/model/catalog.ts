import { RectangleHorizontal, CircleDot, ArrowDownWideNarrow, Calculator, Minus } from 'lucide-react';

export type CalculatorId = 'area' | 'errors' | 'rounding' | 'operations' | 'cancellation';
export type Inputs = Record<string, string>;

export const calculators = [
  { id: 'area', title: 'Площадь прямоугольника', shortTitle: 'Площадь', category: 'Геометрия', number: '01', icon: RectangleHorizontal,
    description: 'Площадь, погрешность измерений и проверка допуска.', defaults: { a: '20', b: '10', ea: '0.1', eb: '0.1', tolerance: '2', unit: 'см' } },
  { id: 'errors', title: 'Погрешности измерений', shortTitle: 'Погрешности', category: 'Точность измерений', number: '02', icon: CircleDot,
    description: 'Абсолютная и относительная погрешности по точному значению.', defaults: { exact: '25', approx: '24.8' } },
  { id: 'rounding', title: 'Округление и усечение', shortTitle: 'Округление', category: 'Обработка чисел', number: '03', icon: ArrowDownWideNarrow,
    description: 'Сравнение результатов и погрешностей двух способов.', defaults: { x: '17.3862', digits: '2' } },
  { id: 'operations', title: 'Арифметические операции', shortTitle: 'Арифметика', category: 'Вычисления с погрешностями', number: '04', icon: Calculator,
    description: 'Четыре операции с учётом погрешностей исходных чисел.', defaults: { a: '12', b: '4', ea: '0.1', eb: '0.1', operation: '+' } },
  { id: 'cancellation', title: 'Вычитание близких чисел', shortTitle: 'Близкие числа', category: 'Устойчивость вычислений', number: '05', icon: Minus,
    description: 'Как малая разность влияет на относительную погрешность.', defaults: { a: '10', b: '9.8', ea: '0.1', eb: '0.1' } },
] as const;

export function isCalculatorId(value: string): value is CalculatorId {
  return calculators.some((calculator) => calculator.id === value);
}

export function getCalculator(id: CalculatorId) {
  return calculators.find((calculator) => calculator.id === id)!;
}

export function getDefaults(id: CalculatorId): Inputs {
  return { ...getCalculator(id).defaults };
}
