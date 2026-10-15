import React from 'react';
export function Scheda({ titolo, meta, azioni, griglia = false, children, style }) {
  return (
    <section style={{ background: 'var(--superficie)', border: '1px solid var(--linea)', borderRadius: 'var(--r-3)', overflow: 'hidden', ...style }}>
      {(titolo || azioni) && (
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--linea)', ...(griglia ? { backgroundImage: 'linear-gradient(var(--griglia) 1px,transparent 1px),linear-gradient(90deg,var(--griglia) 1px,transparent 1px)', backgroundSize: '16px 16px' } : {}) }}>
          <span style={{ font: 'var(--t-h3)', color: 'var(--testo)' }}>{titolo}</span>
          {meta && <span style={{ font: '400 12px/1 var(--font-mono)', color: 'var(--testo-2)' }}>{meta}</span>}
          {azioni && <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{azioni}</span>}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}
