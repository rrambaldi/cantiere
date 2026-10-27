// Scheda «Task e rami» del cantiere: da chi è nato, i task di tasks.md e accanto a ciascuno i cantieri nati da lì.
import { api, type Cantiere } from "./api.ts";
import { Errore, useInvio } from "./comandi.tsx";
import { RigaMarkdown } from "./documento.tsx";
import { Button, Checkbox, Input } from "./ds/core.tsx";
import { StatoBadge } from "./ds/feedback.tsx";
import type { Selezione } from "./indice.tsx";
import { T } from "./testi.ts";
import { Avanzamento, BottoneIcona, Etichetta, Vuoto } from "./ui.tsx";

export type RigaTask = { tipo: "titolo"; testo: string } | { tipo: "task"; fatto: boolean; numero: string | null; testo: string };

const TITOLO = /^#{2,}\s+(.*)$/;
const TASK = /^\s*- \[([^\]\n]{0,3})\](?:\s+(\d+(?:\.\d+)*)(?=\s|$))?\s*(.*)$/;

/** Titoli di sezione e task di un tasks.md; una riga rientrata continua il task di sopra, come in contaTask. */
export function righeTask(testo: string): RigaTask[] {
  const righe: RigaTask[] = [];
  for (const riga of testo.split("\n")) {
    const titolo = TITOLO.exec(riga);
    const task = TASK.exec(riga);
    const ultima = righe[righe.length - 1];
    if (titolo) righe.push({ tipo: "titolo", testo: titolo[1] });
    else if (task) righe.push({ tipo: "task", fatto: task[1].trim().toLowerCase() === "x", numero: task[2] ?? null, testo: task[3] });
    else if (ultima?.tipo === "task" && /^\s+\S/.test(riga)) ultima.testo += " " + riga.trim();
  }
  return righe;
}

/** Un cantiere legato: stato, nome (con il progetto se è un altro), avanzamento; un clic lo apre. Tratteggiato se solo citato. */
function Cartellino({ cantiere, progetto, percorso, qui, citato, task, onScegli }: {
  cantiere: Cantiere | undefined; progetto: string; percorso: string; qui: string; citato: boolean; task?: string | null;
  onScegli: (s: Selezione) => void;
}) {
  return (
    <button className={citato ? "cartellino citato" : "cartellino"} disabled={!cantiere} onClick={() => cantiere && onScegli({ tipo: "cantiere", id: cantiere.id })}>
      {cantiere && <StatoBadge stato={cantiere.stato} etichetta={false} />}
      <span className="nome">{progetto === qui ? percorso : `${progetto} / ${percorso}`}</span>
      {task && <span className="secondario">{T.dalTask(task)}</span>}
      {cantiere?.task && <Avanzamento fatti={cantiere.task.fatti} totali={cantiere.task.totali} attivo={cantiere.stato === "aperto"} />}
      {citato && <span className="tag">{T.citato}</span>}
    </button>
  );
}

/** Le partenze possibili di `c`: non sé stesso, un suo padre o una sua fase (lì basta il padre), né quelle che ha già. */
function partenzePossibili(c: Cantiere, cantieri: Cantiere[]) {
  const padri = new Map(cantieri.map((x) => [x.id, x.padre_id]));
  const linea = (id: number) => {
    const ids: number[] = [];
    for (let x: number | null = id; x !== null; x = padri.get(x) ?? null) ids.push(x);
    return ids;
  };
  const antenati = linea(c.id);
  return cantieri.filter((x) => !antenati.includes(x.id) && !linea(x.id).includes(c.id) && !c.nato_da.some((l) => l.id === x.id));
}

/** «Nato da» messo dalla scheda: la partenza tra i cantieri del committente, prima quelli del progetto, e il task facoltativo. */
function MettiNatoDa({ c, cantieri, onAggiorna }: { c: Cantiere; cantieri: Cantiere[]; onAggiorna: () => Promise<unknown> }) {
  const [aperto, setAperto] = React.useState(false);
  const [da, setDa] = React.useState<number | null>(null);
  const [task, setTask] = React.useState("");
  const { inCorso, errore, invia } = useInvio();
  const possibili = partenzePossibili(c, cantieri);
  if (!aperto) return possibili.length ? <Button size="sm" variant="secondario" onClick={() => setAperto(true)}>{T.aggiungiNatoDa}</Button> : null;
  const progetti = [...new Set([c.progetto, ...possibili.map((x) => x.progetto).sort()])].filter((p) => possibili.some((x) => x.progetto === p));
  const chiudi = () => {
    setAperto(false);
    setDa(null);
    setTask("");
  };
  const lega = async () => {
    if (await invia(() => api.mettiNatoDa(c.id, da!, task.trim() || null).then(onAggiorna))) chiudi();
  };
  return (
    <div className="metti-nato-da">
      <label className="campo-scelta">
        <span className="etichetta">{T.partenza}</span>
        <select value={da ?? ""} onChange={(e) => setDa(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{T.scegliPartenza}</option>
          {progetti.map((p) => (
            <optgroup key={p} label={p}>
              {possibili.filter((x) => x.progetto === p).map((x) => <option key={x.id} value={x.id}>{x.percorso}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <Input label={T.taskFacoltativo} hint={T.suggTask} value={task} onChange={setTask} mono />
      <span className="azioni-esito">
        <Button size="sm" disabled={inCorso || da === null} onClick={() => void lega()}>{T.lega}</Button>
        <Button size="sm" variant="fantasma" disabled={inCorso} onClick={chiudi}>{T.annulla}</Button>
      </span>
      <Errore testo={errore} />
    </div>
  );
}

export function TaskERami({ c, tasks, cantieri, onScegli, onAggiorna }: {
  c: Cantiere; tasks: string | null; cantieri: Cantiere[]; onScegli: (s: Selezione) => void;
  /** Ricarica i dati dopo un «nato da» messo o tolto. */
  onAggiorna: () => Promise<unknown>;
}) {
  const togli = useInvio();
  const perId = new Map(cantieri.map((x) => [x.id, x]));
  // Un livello solo, da qui ai cantieri legati: nessuna visita, quindi nessun rischio di giri.
  const rami = cantieri.flatMap((x) => x.nato_da.filter((l) => l.id === c.id).map((legame) => ({ x, legame })));
  const righe = tasks === null ? [] : righeTask(tasks);
  const numeri = new Set(righe.flatMap((r) => (r.tipo === "task" && r.numero ? [r.numero] : [])));
  const ramo = ({ x, legame }: (typeof rami)[number]) => (
    <li key={x.id}>
      <Cartellino cantiere={x} progetto={x.progetto} percorso={x.percorso} qui={c.progetto} citato={legame.tipo === "citato"} onScegli={onScegli} />
    </li>
  );
  const sciolti = rami.filter((r) => !r.legame.task || !numeri.has(r.legame.task));
  return (
    <div className="task-rami">
      <div className="testa-rami">
        <section>
          <Etichetta>{T.natoDa}</Etichetta>
          {c.nato_da.length ? (
            <ul>
              {c.nato_da.map((l) => (
                <li key={l.id} className="con-azione">
                  <Cartellino cantiere={perId.get(l.id)} progetto={l.progetto} percorso={l.percorso} qui={c.progetto} citato={l.tipo === "citato"} task={l.task} onScegli={onScegli} />
                  <BottoneIcona icona="chiudi" titolo={T.togliNatoDa(l.percorso)} disabled={togli.inCorso}
                    onClick={() => void togli.invia(() => api.togliNatoDa(c.id, l.id).then(onAggiorna))} />
                </li>
              ))}
            </ul>
          ) : <Vuoto>{T.nessunaPartenza}</Vuoto>}
          <Errore testo={togli.errore} />
          <MettiNatoDa key={c.id} c={c} cantieri={cantieri} onAggiorna={onAggiorna} />
        </section>
        <section>
          <Etichetta>{T.ramiN(rami.length)}</Etichetta>
          {rami.length === 0 && <Vuoto>{T.nessunRamo}</Vuoto>}
          {sciolti.length > 0 && <ul>{sciolti.map(ramo)}</ul>}
          {rami.length > sciolti.length && <span className="nota">{T.ramiNeiTask(rami.length - sciolti.length)}</span>}
        </section>
      </div>
      {tasks === null ? <Vuoto>{T.nessunTasks}</Vuoto> : (
        <ul className="righe-task">
          {righe.map((r, i) => r.tipo === "titolo" ? <li key={i} className="titolo-task">{r.testo}</li> : (
            <li key={i} className="riga-task">
              <Checkbox checked={r.fatto} label={<>{r.numero && <b className="numero-task">{r.numero}</b>} <RigaMarkdown testo={r.testo} /></>} />
              <ul className="rami-del-task">{rami.filter((x) => r.numero && x.legame.task === r.numero).map(ramo)}</ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
