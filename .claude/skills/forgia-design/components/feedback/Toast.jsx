import React from 'react';
export function Toast({ tono = 'info', titolo, children, onChiudi }) {
  const bordo = tono === 'errore' ? 'var(--errore)' : 'var(--linea-forte)';
  return (
    <div role="status" style={{ width: 360, maxWidth: '100%', background: 'var(--sfondo-profondo)', color: 'var(--carta-50)', border: '1px solid ' + bordo, borderRadius: 'var(--r-2)', overflow: 'hidden' }}>
      {tono === 'attenzione' && <div style={{ height: 4, background: 'var(--nastro)' }} />}
      <div style={{ display: 'flex', gap: 12, padding: '12px 14px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {titolo && <span style={{ font: 'var(--t-h3)', fontSize: 14 }}>{titolo}</span>}
          {children && <span style={{ font: 'var(--t-piccolo)', color: 'var(--prussia-300)' }}>{children}</span>}
        </div>
        {onChiudi && <button onClick={onChiudi} aria-label="Chiudi" style={{ background: 'none', border: 0, color: 'var(--prussia-300)', font: '400 16px/1 var(--font-mono)', cursor: 'pointer', padding: 2 }}>×</button>}
      </div>
    </div>
  );
}
