const ETICHETTA_STATO = { 'in-corso': 'in corso', completato: 'completato', sospeso: 'sospeso', abbandonato: 'abbandonato' };
function Turno({ t, ultimo }) {
  const riga = (k, v) => (
    <div style={{ display: 'grid', gridTemplateColumns: '60px minmax(0,1fr)' }}>
      <span style={{ color: 'var(--giallo-500)' }}>{k}</span>
      <span style={{ color: v ? 'var(--carta-50)' : 'var(--prussia-300)' }}>{v || '—'}</span>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '76px 18px minmax(0,1fr)', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 16, font: '400 11px/1.2 var(--font-mono)', color: 'var(--prussia-300)' }}>
        <span style={{ color: 'var(--carta-50)', fontWeight: 600 }}>{t.giorno}</span><span>{t.ora}</span><span>{t.mac}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ width: 1, height: 18, background: 'var(--linea-forte)' }} />
        <span style={{ width: 10, height: 10, flex: 'none', background: t.blocca ? 'var(--nastro-fine)' : 'var(--giallo-500)', boxShadow: t.blocca ? 'inset 0 0 0 1px var(--giallo-500)' : 'none' }} />
        {!ultimo && <span style={{ width: 1, flex: 1, background: 'var(--linea-forte)' }} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 0 12px', font: '400 12.5px/1.65 var(--font-mono)', borderBottom: ultimo ? 0 : '1px solid var(--linea)' }}>
        <span style={{ font: 'var(--t-etichetta)', letterSpacing: 'var(--t-etichetta-spaziatura)', textTransform: 'uppercase', color: 'var(--prussia-300)', paddingBottom: 6 }}>{t.sess}</span>
        {riga('fatto', t.fatto)}{riga('dopo', t.dopo)}{riga('blocca', t.blocca)}
      </div>
    </div>
  );
}
function Giornale({ c }) {
  const { Nastro } = window.ForgiaUI;
  const macchine = [...new Set(c.turni.map(t => t.mac))].length;
  return (
    <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      <Nastro altezza={6} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '18px 28px 16px', borderBottom: '1px solid var(--linea)', backgroundImage: 'linear-gradient(var(--griglia) 1px,transparent 1px),linear-gradient(90deg,var(--griglia) 1px,transparent 1px)', backgroundSize: '16px 16px' }}>
        <span style={{ font: 'var(--t-etichetta)', letterSpacing: 'var(--t-etichetta-spaziatura)', textTransform: 'uppercase', color: 'var(--prussia-300)' }}>giornale dei lavori</span>
        <span style={{ font: '600 26px/1.1 var(--font-mono)', letterSpacing: '-.03em' }}>{c.id}</span>
        <span style={{ font: 'var(--t-piccolo)', color: 'var(--prussia-300)' }}>aperto {/^(oggi|ieri)$/.test(c.aperto) ? '' : 'il '}{c.aperto} · {c.turni.length} {c.turni.length === 1 ? 'sessione' : 'sessioni'} su {macchine} {macchine === 1 ? 'macchina' : 'macchine'} · {ETICHETTA_STATO[c.stato]}</span>
      </div>
      {c.provvisorio && (
        <div style={{ margin: '14px 28px 0', padding: '10px 12px', border: '1px solid var(--linea-forte)', borderRadius: 'var(--r-2)', font: 'var(--t-piccolo)', color: 'var(--carta-50)' }}>
          Cantiere provvisorio, assegnato in automatico. Rinominalo dalla sessione con <code style={{ font: 'var(--t-codice)', color: 'var(--giallo-500)' }}>/forgia nome</code>.
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 28px 24px' }}>
        {c.turni.map((t, i) => <Turno key={i} t={t} ultimo={i === c.turni.length - 1} />)}
      </div>
    </main>
  );
}
window.Giornale = Giornale;
