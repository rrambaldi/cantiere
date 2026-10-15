import React from 'react';
export function Switch({ on = false, onChange, label, disabled = false }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange && onChange(!on)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'none', border: 0, padding: 0, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .45 : 1, font: 'var(--t-piccolo)', color: 'var(--testo)' }}>
      <span style={{ width: 32, height: 18, flex: 'none', borderRadius: 'var(--r-1)', position: 'relative', background: on ? 'var(--segnale)' : 'var(--sfondo-profondo)', border: '1px solid ' + (on ? 'var(--segnale)' : 'var(--linea-forte)'), transition: 'background var(--durata-2) var(--curva)' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 12, height: 12, borderRadius: 1, background: on ? 'var(--testo-su-segnale)' : 'var(--prussia-300)', transition: 'left var(--durata-2) var(--curva)' }} />
      </span>
      {label}
    </button>
  );
}
