import React from 'react';
export function Nastro({ altezza = 8, fine = false, style }) {
  return <div aria-hidden="true" style={{ height: fine ? 4 : altezza, background: 'var(--nastro)', flex: 'none', ...style }} />;
}
