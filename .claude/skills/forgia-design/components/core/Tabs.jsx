import React from 'react';
export function Tabs({ items = [], value, onChange }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 20, borderBottom: '1px solid var(--linea)' }}>
      {items.map(it => {
        const a = it.id === value;
        return (
          <button key={it.id} role="tab" aria-selected={a} onClick={() => onChange && onChange(it.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: 0, marginBottom: -1, background: 'none', border: 0, borderBottom: '2px solid ' + (a ? 'var(--segnale)' : 'transparent'), cursor: 'pointer', font: 'var(--t-piccolo)', fontWeight: a ? 600 : 400, color: a ? 'var(--testo)' : 'var(--testo-2)' }}>
            {it.label}
            {it.count != null && <span style={{ font: '400 11px/1 var(--font-mono)', color: 'var(--testo-2)' }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
