function Indice({ cantieri, attivo, onScegli, vista, onVista, connessione }) {
  const { Logo, Tabs, StatoBadge } = window.ForgiaUI;
  const aperti = cantieri.filter(c => c.stato === 'in-corso' || c.stato === 'sospeso');
  const chiusi = cantieri.filter(c => c.stato === 'completato' || c.stato === 'abbandonato');
  const elenco = vista === 'aperti' ? aperti : chiusi;
  return (
    <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--prussia-800)', borderRight: '1px solid var(--linea)' }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 16px' }}><Logo size={22} wordmark /></div>
      <div style={{ padding: '0 16px' }}>
        <Tabs value={vista} onChange={onVista} items={[{ id: 'aperti', label: 'Aperti', count: aperti.length }, { id: 'chiusi', label: 'Chiusi', count: chiusi.length }]} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {elenco.map(c => {
          const sel = c.id === attivo;
          return (
            <button key={c.id} onClick={() => onScegli(c.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 16px', border: 0, background: sel ? 'var(--prussia-650)' : 'transparent', color: 'var(--carta-50)', cursor: 'pointer', textAlign: 'left' }}>
              <StatoBadge stato={c.stato} etichetta={false} />
              <span style={{ font: (sel ? 600 : 500) + ' 12.5px/1 var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: c.provvisorio ? 'italic' : 'normal' }}>{c.id}</span>
              <span style={{ marginLeft: 'auto', font: '400 10.5px/1 var(--font-mono)', color: 'var(--prussia-300)' }}>{c.ora}</span>
            </button>
          );
        })}
        {elenco.length === 0 && <p style={{ margin: 0, padding: '12px 16px', font: 'var(--t-piccolo)', color: 'var(--prussia-300)' }}>Nessun cantiere.</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 16px', borderTop: '1px solid var(--linea)', font: '400 11px/1.4 var(--font-mono)', color: 'var(--prussia-300)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--carta-50)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--giallo-500)' }} />{connessione.stato}</span>
        <span>ultimo invio {connessione.ultimoInvio} · {connessione.macchine} macchine</span>
      </div>
    </aside>
  );
}
window.Indice = Indice;
