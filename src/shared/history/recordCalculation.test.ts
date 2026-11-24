import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculationService } from '../../modules/calculators/model/calculationService';
import { getDefaults } from '../../modules/calculators/model/catalog';
import { evaluate } from '../../modules/calculators/model/evaluate';
import { previewNumerical, runNumerical } from '../../modules/numerical/service';
import { historyRepository } from './repository';

vi.mock('./repository', () => ({ historyRepository: { add: vi.fn() } }));

const add = vi.mocked(historyRepository.add);
const area = { ...getDefaults('area'), a: '3,25', b: '4' };
const partial = { expression: 'x*y^2', axis: 'y', x: '2', y: '4', z: '0', h: '0,01' };

describe('сохранение расчётов через декоратор', () => {
  beforeEach(() => { add.mockReset().mockResolvedValue(undefined); });

  it('сохраняет исходный ввод, точность и результаты обычного калькулятора', async () => {
    const { entry, result } = await calculationService.run('area', area, 4);
    expect(result).toEqual(evaluate('area', area, 4));
    expect(entry.inputs).toEqual({ ...area, displayPrecision: '4' });
    expect(entry.summary).toContain('13,0000');
    expect(entry.unit).toBe('см²');
    expect(entry.details).toContain(result.interval!.label + ': ' + result.interval!.value);
    expect(add).toHaveBeenCalledExactlyOnceWith(entry);
  });

  it('предпросмотр не пишет в историю, а запуск сохраняет частную производную без округления', async () => {
    const preview = previewNumerical('partial', partial);
    expect(add).not.toHaveBeenCalled();
    const result = await runNumerical('partial', partial);
    expect(result).toEqual(preview);
    expect(result.value).toBeCloseTo(16);
    expect(add).toHaveBeenCalledExactlyOnceWith({
      calculatorId: 'partial', title: 'Частная производная', inputs: partial,
      summary: result.summary, details: result.details, unit: '', numericalResult: { value: result.value },
    });
  });

  it('сохраняет все сегменты графика вместе с формулой и границами', async () => {
    const inputs = { expression: '1/x', min: '-1', max: '1' };
    const result = await runNumerical('plot', inputs);
    expect(result.segments?.length).toBeGreaterThan(1);
    expect(add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      calculatorId: 'plot', inputs, numericalResult: { segments: result.segments },
    }));
  });

  it('при ошибке вычислений ни один сервис не пытается вставить запись', async () => {
    await expect(calculationService.run('area', { ...area, a: '' }, 4)).rejects.toThrow();
    await expect(runNumerical('derivative', { expression: 'x+', x: '2' })).rejects.toThrow();
    expect(add).not.toHaveBeenCalled();
  });

  it('сбой записи не отменяет готовый результат и возвращает предупреждение', async () => {
    add.mockRejectedValue(new Error('Storage unavailable'));
    const old = await calculationService.run('area', area, 4);
    expect(old.result).toEqual(evaluate('area', area, 4));
    expect(old.warning).toContain('Сохранить');
    const inputs = { expression: 'x^2', x: '3' };
    const numerical = await runNumerical('derivative', inputs);
    expect(numerical.value).toBeCloseTo(6);
    expect(numerical.warning).toBe(old.warning);
    expect(add).toHaveBeenCalledTimes(2);
  });
});
