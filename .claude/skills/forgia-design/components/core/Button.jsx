import React from 'react';
const base = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px solid transparent', borderRadius: 'var(--r-2)', fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: 'pointer', transition: 'background var(--durata-1) var(--curva), border-color var(--durata-1) var(--curva)', whiteSpace: 'nowrap' };
const sizes = { sm: { height: 28, padding: '0 10px', fontSize: 13 }, md: { height: 36, padding: '0 14px', fontSize: 14 } };
export function Button({ variant = 'primario', size = 'md', disabled = false, mono = false, children, onClick, type = 'button', style }) {
  const [h, setH] = React.useState(false);
  const v = {
    primario: { background: h ? 'var(--segnale-hover)' : 'var(--segnale)', color: 'var(--testo-su-segnale)' },
    secondario: { background: h ? 'var(--superficie-alta)' : 'transparent', color: 'var(--testo)', borderColor: 'var(--linea-forte)' },
    fantasma: { background: h ? 'var(--superficie)' : 'transparent', color: 'var(--testo)' },
  }[variant];
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ ...base, ...sizes[size], ...v, ...(mono ? { fontFamily: 'var(--font-mono)', fontWeight: 500 } : {}), ...(disabled ? { opacity: .45, cursor: 'not-allowed' } : {}), ...style }}>
      {children}
    </button>
  );
}
