export function Logo({ compact = false }: { compact?: boolean }) {
  return <span className="brand">
    <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M6 24V8l10 11L26 8v16M6 8v6m20-6v6" stroke="currentColor" strokeWidth="2.2" /></svg></span>
    {!compact && <span className="brand-name">мера<span className="brand-period">.</span></span>}
  </span>;
}
