import React from 'react';
export function Dialog({ aperto = true, titolo, children, azioni, onChiudi, inline = false }) {
  if (!aperto) return null;
  const box = (
    <div role="dialog" aria-modal="true" style={{ width: 440, maxWidth: '100%', background: 'var(--superficie)', color: 'var(--testo)', border: '1px solid var(--linea-forte)', borderRadius: 'var(--r-3)', boxShadow: 'var(--ombra-dialogo)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '18px 20px 0', font: 'var(--t-h2)', fontSize: 18 }}>{titolo}</div>
      <div style={{ padding: '10px 20px 18px', font: 'var(--t-corpo)', fontSize: 14, color: 'var(--testo-2)' }}>{children}</div>
      {azioni && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--linea)' }}>{azioni}</div>}
    </div>
  );
  if (inline) return box;
  return <div onClick={e => e.target === e.currentTarget && onChiudi && onChiudi()} style={{ position: 'fixed', inset: 0, background: 'rgba(14,32,65,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 }}>{box}</div>;
}
