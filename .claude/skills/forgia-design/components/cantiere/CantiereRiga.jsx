import React from 'react';
import { StatoBadge } from '../feedback/StatoBadge.jsx';
export function CantiereRiga({ nome, chi, macchina, fatti = 0, totali = 0, stato = 'in-corso', aggiornato, ultima = false }) {
  const pct = totali ? Math.round(fatti / totali * 100) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) 96px 120px 64px', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: ultima ? 0 : '1px solid var(--linea)' }}>
      <span style={{ font: '600 13.5px/1.3 var(--font-mono)', color: 'var(--testo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
      <span style={{ font: 'var(--t-piccolo)', color: 'var(--testo-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[chi, macchina].filter(Boolean).join(' · ')}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ font: '400 12px/1 var(--font-mono)', color: 'var(--testo)', width: 30 }}>{fatti}/{totali}</span>
        <span style={{ flex: 1, height: 4, background: 'var(--linea)', position: 'relative' }}><span style={{ position: 'absolute', inset: 0, width: pct + '%', background: stato === 'in-corso' ? 'var(--segnale)' : 'var(--testo-2)' }} /></span>
      </span>
      <StatoBadge stato={stato} />
      <span style={{ font: '400 11.5px/1 var(--font-mono)', color: 'var(--testo-2)', textAlign: 'right' }}>{aggiornato}</span>
    </div>
  );
}
