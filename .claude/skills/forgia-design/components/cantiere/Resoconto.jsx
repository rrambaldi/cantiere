import React from 'react';
export function Resoconto({ cantiere, chi, branch, fatto, dopo, blocca }) {
  const righe = [['fatto', fatto], ['dopo', dopo], ['blocca', blocca]];
  return (
    <div style={{ background: 'var(--prussia-800)', color: 'var(--carta-50)', borderRadius: 'var(--r-2)', padding: '12px 14px', font: 'var(--t-codice)', fontSize: 12.5, lineHeight: 1.75 }}>
      {cantiere && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><span style={{ color: 'var(--giallo-500)', fontWeight: 600 }}>{cantiere}</span>{(chi || branch) && <span style={{ color: 'var(--prussia-300)' }}>{[chi, branch].filter(Boolean).join(' · ')}</span>}</div>}
      {righe.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr)' }}>
          <span style={{ color: 'var(--giallo-500)' }}>{k}</span>
          <span style={{ color: v ? 'var(--carta-50)' : 'var(--prussia-300)' }}>{v || '—'}</span>
        </div>
      ))}
    </div>
  );
}
