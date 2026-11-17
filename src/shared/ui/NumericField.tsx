import { useId } from 'react';

interface NumericFieldProps {
  label: string;
  symbol?: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  hint?: string;
  name?: string;
}

export function NumericField({ label, symbol, value, onChange, suffix, hint, name }: NumericFieldProps) {
  const id = useId();
  return (
    <div className="numeric-field">
      <label htmlFor={id}>{label}{symbol && <span className="field-symbol">{symbol}</span>}</label>
      <div className="input-wrap">
        <input id={id} name={name} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
          value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </div>
      {hint && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
}
