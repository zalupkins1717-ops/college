import { useCallback, useEffect, useRef, useState } from 'react';
import { calculationService } from './model/calculationService';
import type { CalculatorId, Inputs } from './model/catalog';

type Status = 'pending' | 'saving' | 'saved' | 'failed';
type Draft = { key: string; inputs: Inputs; precision: number; status: Status };

export function useCalculationHistory(id: CalculatorId) {
  const current = useRef<Draft | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  const [saved, setSaved] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const draft = current.current;
    if (!draft || draft.status !== 'pending') return;
    draft.status = 'saving';
    void calculationService.run(id, draft.inputs, draft.precision).then(record => {
      draft.status = record.warning ? 'failed' : 'saved';
      if (mounted.current && current.current === draft) {
        setSaved(!record.warning);
        setStorageError(record.warning ?? null);
      }
    }).catch(() => {
      // The live preview already displays the validation error, and the decorator skips the write.
      draft.status = 'failed';
    });
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  const record = useCallback((inputs: Inputs, precision: number, immediately = false) => {
    const key = JSON.stringify([inputs, precision]);
    const prior = current.current;
    if (prior?.key === key && (prior.status === 'saved' || prior.status === 'saving')) return;
    current.current = { key, inputs, precision, status: 'pending' };
    setSaved(false);
    setStorageError(null);
    window.clearTimeout(timer.current);
    if (immediately) flush();
    else timer.current = window.setTimeout(flush, 650);
  }, [flush]);

  const restored = useCallback((inputs: Inputs, precision: number) => {
    flush();
    current.current = { key: JSON.stringify([inputs, precision]), inputs, precision, status: 'saved' };
    setSaved(true);
    setStorageError(null);
  }, [flush]);

  return { record, restored, saved, storageError };
}
