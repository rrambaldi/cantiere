const FRASI = {
  completato: ['Chiudere come completato?', 'L’esito resta nel giornale dei lavori. Si può riaprire.', 'Chiudi come completato'],
  sospeso: ['Sospendere il cantiere?', 'Resta tra gli aperti, fermo. Le nuove sessioni non lo riprendono da sole.', 'Sospendi'],
  abbandonato: ['Abbandonare il cantiere?', 'Passa tra i chiusi con esito abbandonato. Il giornale resta consultabile.', 'Abbandona'],
};
function App() {
  const { Dialog, Button, Toast } = window.ForgiaUI;
  const D = window.FORGIA_DATI;
  const [cantieri, setCantieri] = React.useState(() => D.cantieri.map(c => ({ ...c, todos: c.todos.map(t => [...t]) })));
  const [attivo, setAttivo] = React.useState(localStorage.getItem('forgia-kit-attivo') || 'auth-refactor');
  const [vista, setVista] = React.useState('aperti');
  const [chiedi, setChiedi] = React.useState(null);
  const [avviso, setAvviso] = React.useState(null);
  React.useEffect(() => { localStorage.setItem('forgia-kit-attivo', attivo); }, [attivo]);
  React.useEffect(() => { if (!avviso) return; const t = setTimeout(() => setAvviso(null), 3200); return () => clearTimeout(t); }, [avviso]);
  const c = cantieri.find(x => x.id === attivo) || cantieri[0];
  const aggiorna = (id, f) => setCantieri(cs => cs.map(x => x.id === id ? f(x) : x));
  const conferma = () => {
    const esito = chiedi;
    aggiorna(c.id, x => ({ ...x, stato: esito }));
    setChiedi(null);
    if (esito !== 'sospeso') setVista('chiusi');
    setAvviso({ titolo: esito === 'sospeso' ? 'Cantiere sospeso' : 'Cantiere chiuso', testo: c.id + ' · ' + (esito === 'sospeso' ? 'sospeso' : esito) });
  };
  const riapri = () => { aggiorna(c.id, x => ({ ...x, stato: 'in-corso' })); setVista('aperti'); setAvviso({ titolo: 'Cantiere riaperto', testo: c.id + ' · in corso' }); };
  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '232px minmax(0,1fr) 268px', background: 'var(--prussia-700)', color: 'var(--carta-50)', overflow: 'hidden' }}>
      <Indice cantieri={cantieri} attivo={c.id} onScegli={setAttivo} vista={vista} onVista={setVista} connessione={D.connessione} />
      <Giornale c={c} />
      <SchedaTecnica c={c}
        onTodo={(i, v) => aggiorna(c.id, x => ({ ...x, todos: x.todos.map((t, j) => j === i ? [t[0], v] : t) }))}
        onEsito={setChiedi} onRiapri={riapri} />
      {chiedi && (
        <Dialog titolo={FRASI[chiedi][0]} onChiudi={() => setChiedi(null)}
          azioni={<><Button variant="fantasma" size="sm" onClick={() => setChiedi(null)}>Annulla</Button><Button size="sm" onClick={conferma}>{FRASI[chiedi][2]}</Button></>}>
          <span style={{ font: 'var(--t-codice)', color: 'var(--carta-50)' }}>{c.id}</span> · {c.todos.filter(t => t[1]).length}/{c.todos.length} todo. {FRASI[chiedi][1]}
        </Dialog>
      )}
      {avviso && <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 200 }}><Toast titolo={avviso.titolo} onChiudi={() => setAvviso(null)}>{avviso.testo}</Toast></div>}
    </div>
  );
}
window.App = App;
