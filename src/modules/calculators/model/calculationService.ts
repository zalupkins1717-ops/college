import { recordCalculation } from '../../../shared/history/recordCalculation';
import type { Recorded } from '../../../shared/history/recordCalculation';
import { getCalculator } from './catalog';
import type { CalculatorId, Inputs } from './catalog';
import { evaluate } from './evaluate';
import type { Result } from './evaluate';

class CalculationService {
  @recordCalculation
  async run(id: CalculatorId, inputs: Inputs, precision: number): Promise<Recorded<Result>> {
    const result = evaluate(id, inputs, precision);
    const details = result.metrics.map(metric =>
      [metric.label + ':', metric.value, metric.unit].filter(Boolean).join(' '));
    if (result.interval) details.push(result.interval.label + ': ' + result.interval.value);
    return {
      result,
      entry: {
        calculatorId: id,
        title: getCalculator(id).title,
        inputs: { ...inputs, displayPrecision: String(precision) },
        summary: [result.label + ':', result.value, result.unit].filter(Boolean).join(' '),
        details,
        unit: result.unit,
      },
    };
  }
}

export const calculationService = new CalculationService();
