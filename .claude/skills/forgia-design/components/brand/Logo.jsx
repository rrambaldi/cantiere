import React from 'react';
const A48='M3 20L44 20L44 26L35 26L31 33L37 39L40 39L40 44L12 44L12 39L15 39L21 33L17 26Z';
const A16='M1 7L15 7L15 10L11 10L10 12L13 13L13 15L3 15L3 13L6 12L5 10Z';
export function Logo({ size = 32, wordmark = false, mono = false, style }) {
  const small = size <= 20;
  const mark = 'var(--segno)';
  const piece = mono ? mark : 'var(--segnale)';
  const svg = small
    ? <svg viewBox="0 0 16 16" width={size} height={size} style={{ display: 'block', flex: 'none' }} aria-hidden="true"><path fill={mark} d={A16} /><rect x="5" y="3" width="7" height="2" fill={piece} /></svg>
    : <svg viewBox="0 0 48 48" width={size} height={size} style={{ display: 'block', flex: 'none' }} aria-hidden="true"><path fill={mark} d={A48} /><rect x="17" y="12" width="18" height="5" fill={piece} /></svg>;
  if (!wordmark) return <span role="img" aria-label="forgia" style={{ display: 'inline-flex', ...style }}>{svg}</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.25), ...style }}>
      {svg}
      <span style={{ font: `600 ${Math.round(size * 0.72)}px/1 var(--font-mono)`, letterSpacing: '-.04em', color: 'var(--testo)' }}>forgia</span>
    </span>
  );
}
