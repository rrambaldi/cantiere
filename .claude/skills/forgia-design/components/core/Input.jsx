import React from 'react';
export function Input({ label, hint, error, value, onChange, placeholder, prefix, mono = false, disabled = false, style }) {
  const [f, setF] = React.useState(false);
  const border = error ? 'var(--errore)' : f ? 'var(--focus)' : 'var(--linea-forte)';
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && <span style={{ font: 'var(--t-etichetta)', letterSpacing: 'var(--t-etichetta-spaziatura)', textTransform: 'uppercase', color: 'var(--testo-2)' }}>{label}</span>}
      <span style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 10px', gap: 6, background: 'var(--sfondo-profondo)', border: '1px solid ' + border, borderRadius: 'var(--r-2)', opacity: disabled ? .5 : 1 }}>
        {prefix && <span style={{ font: 'var(--t-codice)', color: 'var(--testo-2)' }}>{prefix}</span>}
        <input value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
          onFocus={() => setF(true)} onBlur={() => setF(false)}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--carta-50)', font: mono ? 'var(--t-codice)' : 'var(--t-corpo)', fontSize: 14 }} />
      </span>
      {(error || hint) && <span style={{ font: 'var(--t-piccolo)', color: error ? 'var(--errore)' : 'var(--testo-2)' }}>{error || hint}</span>}
    </label>
  );
}
