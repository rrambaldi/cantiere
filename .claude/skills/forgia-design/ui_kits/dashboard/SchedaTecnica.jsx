function SchedaTecnica({ c, onTodo, onEsito, onRiapri }) {
  const { Checkbox, Button, StatoBadge } = window.ForgiaUI;
  const fatti = c.todos.filter(t => t[1]).length;
  const aperto = c.stato === 'in-corso' || c.stato === 'sospeso';
  const etichetta = { font: 'var(--t-etichetta)', letterSpacing: 'var(--t-etichetta-spaziatura)', textTransform: 'uppercase', color: 'var(--prussia-300)' };
  const campi = [['progetto', c.progetto], ['branch', c.branch], ['chi', c.chi], ['todo', fatti + '/' + c.todos.length]];
  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '20px 18px', minHeight: 0, overflowY: 'auto', background: 'var(--prussia-650)', borderLeft: '1px solid var(--linea)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={etichetta}>scheda tecnica</span>
        <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0,1fr)', rowGap: 6, font: '400 12px/1.3 var(--font-mono)' }}>
          {campi.map(([k, v]) => <React.Fragment key={k}><span style={{ color: 'var(--prussia-300)' }}>{k}</span><span>{v}</span></React.Fragment>)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={etichetta}>programma dei lavori</span>
        {c.todos.length === 0 && <span style={{ font: 'var(--t-piccolo)', color: 'var(--prussia-300)' }}>Nessun todo ancora.</span>}
        {c.todos.map(([t, d], i) => <Checkbox key={i} checked={d} disabled={!aperto} onChange={v => onTodo(i, v)} label={<span style={{ color: d ? 'var(--prussia-300)' : 'var(--carta-50)' }}>{t}</span>} />)}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={etichetta}>esito</span>
        {aperto ? (
          <>
            <Button onClick={() => onEsito('completato')} style={{ width: '100%' }}>Chiudi come completato</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              {c.stato !== 'sospeso' && <Button variant="secondario" size="sm" onClick={() => onEsito('sospeso')} style={{ flex: 1 }}>Sospendi</Button>}
              {c.stato === 'sospeso' && <Button variant="secondario" size="sm" onClick={onRiapri} style={{ flex: 1 }}>Riprendi</Button>}
              <Button variant="fantasma" size="sm" onClick={() => onEsito('abbandonato')} style={{ flex: 1 }}>Abbandona</Button>
            </div>
          </>
        ) : (
          <>
            <StatoBadge stato={c.stato} />
            <Button variant="secondario" size="sm" onClick={onRiapri}>Riapri</Button>
          </>
        )}
      </div>
    </aside>
  );
}
window.SchedaTecnica = SchedaTecnica;
