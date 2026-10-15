import React from 'react';
export function Checkbox({ checked = false, onChange, label, disabled = false }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .45 : 1, font: 'var(--t-piccolo)', color: 'var(--testo)' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange && onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span style={{ width: 16, height: 16, flex: 'none', borderRadius: 'var(--r-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: checked ? 'var(--segnale)' : 'transparent', border: '1px solid ' + (checked ? 'var(--segnale)' : 'var(--linea-forte)') }}>
        {checked && <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke="var(--testo-su-segnale)" strokeWidth="2" /></svg>}
      </span>
      {label}
    </label>
  );
}
