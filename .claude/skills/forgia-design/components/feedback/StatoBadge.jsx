import React from 'react';
const ETICHETTE = { 'in-corso': 'in corso', completato: 'completato', sospeso: 'sospeso', abbandonato: 'abbandonato' };
export function StatoBadge({ stato = 'in-corso', etichetta = true }) {
  const dot = {
    'in-corso': { background: 'var(--stato-in-corso)' },
    completato: { background: 'var(--stato-completato)' },
    sospeso: { border: '2px solid var(--stato-sospeso)' },
    abbandonato: { border: '2px dashed var(--stato-abbandonato)' },
  }[stato];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--t-piccolo)', color: 'var(--testo)', whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, flex: 'none', borderRadius: '50%', boxSizing: 'border-box', ...dot }} />
      {etichetta ? ETICHETTE[stato] : <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{ETICHETTE[stato]}</span>}
    </span>
  );
}
