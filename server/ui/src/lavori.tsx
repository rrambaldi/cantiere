// Colonna centrale: giornale e change di un cantiere, oppure il quadro di un progetto o di un committente.
import type { ReactNode } from "react";
import type { Cantiere, Committente, Dettaglio, FileCopia, NonCensita, Progetto, Turno } from "./api.ts";
import { Documento } from "./documento.tsx";
import { Nastro } from "./ds/cantiere.tsx";
import { Button, Tabs } from "./ds/core.tsx";
import { StatoBadge } from "./ds/feedback.tsx";
import { ETICHETTA_STATO, giorno, ora, quando } from "./formato.ts";
import type { Selezione } from "./indice.tsx";
import { Avanzamento, Avviso, Etichetta, Vuoto } from "./ui.tsx";

const FILE_AMMESSI = ".md,.txt,text/markdown,text/plain";

function Testata({ etichetta, titolo, sotto }: { etichetta: string; titolo: string; sotto: ReactNode }) {
  return (
    <>
      <Nastro altezza={6} />
      <header className="testata griglia">
        <Etichetta>{etichetta}</Etichetta>
        <h1 className="titolo-lavoro">{titolo}</h1>
        <span className="sotto">{sotto}</span>
      </header>
    </>
  );
}

function RigaResoconto({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="riga-resoconto">
      <span>{k}</span>
      <span className={v ? "" : "vuota"}>{v || "—"}</span>
    </div>
  );
}

function Turni({ turni }: { turni: Turno[] }) {
  if (!turni.length) return <Vuoto>Nessun resoconto ancora. Arriva quando Claude chiude un turno con aggiorna_stato.</Vuoto>;
  return (
    <ol className="turni">
      {turni.map((t, i) => (
        <li key={t.ts + t.session_id} className="turno">
          <div className="turno-quando"><strong>{giorno(t.ts)}</strong><span>{ora(t.ts)}</span><span className="host" title={t.host}>{t.host}</span></div>
          <div className="turno-filo" aria-hidden="true">
            <span className="filo" style={{ height: 18 }} />
            <span className={"nodo" + (t.bloccato_da ? " bloccato" : "")} />
            {i < turni.length - 1 && <span className="filo" style={{ flex: 1 }} />}
          </div>
          <div className={"turno-corpo" + (i < turni.length - 1 ? " con-linea" : "")}>
            <span className="etichetta">{t.titolo || "sessione " + t.session_id.slice(0, 8)}{t.percentuale != null ? ` · ${t.percentuale}%` : ""}</span>
            <RigaResoconto k="fatto" v={t.fatto} />
            <RigaResoconto k="dopo" v={t.prossimo} />
            <RigaResoconto k="blocca" v={t.bloccato_da} />
          </div>
        </li>
      ))}
    </ol>
  );
}

const ORDINE_FILE = ["proposal.md", "design.md", "tasks.md"];
const rango = (p: string) => {
  const i = ORDINE_FILE.indexOf(p);
  return i >= 0 ? i : p.startsWith("specs/") ? 3 : p.startsWith("idee/") ? 4 : 5;
};

/** Elenco dei file e il file scelto, formattato. */
function Documenti({ file, vuoto, azioni }: {
  file: FileCopia[]; vuoto: ReactNode; azioni?: (f: FileCopia) => ReactNode;
}) {
  const ordinati = [...file].sort((a, b) => rango(a.percorso) - rango(b.percorso) || a.percorso.localeCompare(b.percorso));
  const [scelto, setScelto] = React.useState<string | null>(null);
  const corrente = ordinati.find((f) => f.percorso === scelto) ?? ordinati[0];
  if (!corrente) return <Vuoto>{vuoto}</Vuoto>;
  return (
    <div className="documenti">
      <ul className="elenco-file">
        {ordinati.map((f) => (
          <li key={f.percorso}>
            <button className={"voce-file" + (f === corrente ? " attiva" : "")} onClick={() => setScelto(f.percorso)}>{f.percorso}</button>
          </li>
        ))}
      </ul>
      <article className="documento">
        <div className="documento-testa">
          <code>{corrente.percorso}</code>
          {azioni?.(corrente)}
        </div>
        <Documento percorso={corrente.percorso} contenuto={corrente.contenuto} />
      </article>
    </div>
  );
}

/** Zona dove trascinare o scegliere i file .md e .txt di un'idea. */
export function ZonaFile({ onFile, testo = "Trascina qui file .md o .txt, oppure sceglili" }: { onFile: (f: File[]) => void; testo?: string }) {
  const [sopra, setSopra] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <div className={"zona-file" + (sopra ? " sopra" : "")}
      onDragOver={(e) => { e.preventDefault(); setSopra(true); }} onDragLeave={() => setSopra(false)}
      onDrop={(e) => { e.preventDefault(); setSopra(false); onFile([...e.dataTransfer.files]); }}>
      <span>{testo}</span>
      <Button variant="secondario" size="sm" onClick={() => input.current?.click()}>Scegli file</Button>
      <input ref={input} type="file" multiple accept={FILE_AMMESSI} hidden
        onChange={(e) => { onFile([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </div>
  );
}

type Scheda = "giornale" | "change";

export function LavoroCantiere({ d, onFile, onTogliFile }: {
  d: Dettaglio; onFile: (f: File[]) => void; onTogliFile: (nome: string) => void;
}) {
  const c = d.cantiere;
  const idea = c.stato === "idea";
  const [scheda, setScheda] = React.useState<Scheda>("giornale");
  React.useEffect(() => setScheda("giornale"), [c.id]);
  const macchine = new Set(d.turni.map((t) => t.host)).size;
  const sotto = [
    c.progetto,
    `change ${c.change}`,
    ETICHETTA_STATO[c.stato],
    `creato ${giorno(c.creato_il)}`,
    ...(idea ? [] : [d.turni.length ? `${d.turni.length} ${d.turni.length === 1 ? "turno" : "turni"} su ${macchine} ${macchine === 1 ? "macchina" : "macchine"}` : "nessun turno"]),
  ].join(" · ");
  return (
    <main className="lavori">
      <Testata etichetta={idea ? "idea" : "giornale dei lavori"} titolo={c.percorso} sotto={sotto} />
      <div className="corpo-lavoro">
        {c.descrizione && <p className="descrizione">{c.descrizione}</p>}
        {c.change_mancante && c.stato === "aperto" && (
          <Avviso>Il change <code>{c.change}</code> non c'è ancora nel repo. Lo crea Claude con <code>openspec new change {c.change}</code>.</Avviso>
        )}
        {c.da_archiviare && (
          <Avviso>Abbandonato, ma il change è ancora nel repo. Alla prossima sessione in {c.progetto} Claude proporrà <code>openspec archive {c.change} --skip-specs</code>.</Avviso>
        )}
        {idea ? (
          <>
            <Etichetta>file dell'idea · {d.file.length}</Etichetta>
            <ZonaFile onFile={onFile} />
            <Documenti file={d.file} vuoto="Nessun file. Aggiungi gli appunti da cui Claude partirà per scrivere il change."
              azioni={(f) => <Button variant="fantasma" size="sm" onClick={() => onTogliFile(f.percorso.replace(/^idee\//, ""))}>Togli</Button>} />
          </>
        ) : (
          <>
            <Tabs value={scheda} onChange={setScheda} items={[
              { id: "giornale", label: "Giornale", count: d.turni.length },
              { id: "change", label: "Change", count: d.file.length },
            ]} />
            {scheda === "giornale"
              ? <Turni turni={d.turni} />
              : <Documenti file={d.file} vuoto="Nessuna copia del change. Arriva dal plugin alla fine del primo turno che tocca openspec/changes/." />}
          </>
        )}
      </div>
    </main>
  );
}

function RigaCantiere({ c, onScegli }: { c: Cantiere; onScegli: (s: Selezione) => void }) {
  return (
    <button className="riga-cantiere" onClick={() => onScegli({ tipo: "cantiere", id: c.id })}>
      <span className="nome">{c.percorso}</span>
      <span className="secondario">{c.sessioni.map((s) => s.host).join(" · ") || "—"}</span>
      {c.task ? <Avanzamento fatti={c.task.fatti} totali={c.task.totali} attivo={c.stato === "aperto"} /> : <span className="secondario">—</span>}
      <StatoBadge stato={c.stato} />
    </button>
  );
}

export function LavoroProgetto({ p, committente, nonCensite, onScegli }: {
  p: Progetto; committente: string; nonCensite: NonCensita[] | null; onScegli: (s: Selezione) => void;
}) {
  const attivi = p.cantieri.filter((c) => c.stato === "aperto" || c.stato === "sospeso" || c.stato === "idea");
  return (
    <main className="lavori">
      <Testata etichetta="progetto" titolo={p.nome} sotto={`${committente} · ${p.cantieri.length} cantieri · creato ${giorno(p.creato_il)}`} />
      <div className="corpo-lavoro">
        <section className="sezione">
          <Etichetta>cantieri aperti e idee</Etichetta>
          {attivi.length ? <div className="righe">{attivi.map((c) => <RigaCantiere key={c.id} c={c} onScegli={onScegli} />)}</div>
            : <Vuoto>Nessun cantiere aperto. Crea un'idea dalla scheda a destra, oppure aprilo da Claude Code.</Vuoto>}
        </section>
        <section className="sezione">
          <Etichetta>attività non censite</Etichetta>
          {nonCensite === null ? <Vuoto>Caricamento.</Vuoto> : nonCensite.length === 0
            ? <Vuoto>Nessuna. Qui finisce il lavoro fatto su {p.nome} senza un cantiere.</Vuoto>
            : (
              <div className="tabella-scorre">
                <table className="tabella">
                  <thead><tr><th>titolo</th><th>macchina</th><th>avviata</th><th>ultimo evento</th><th className="numero">turni</th><th>stato</th></tr></thead>
                  <tbody>
                    {nonCensite.map((s) => (
                      <tr key={s.session_id}>
                        <td>{s.titolo ?? <span className="secondario">sessione {s.session_id.slice(0, 8)}</span>}</td>
                        <td>{s.host}</td><td>{quando(s.avviata_il)}</td><td>{quando(s.ultimo_evento_il)}</td>
                        <td className="numero">{s.turni}</td><td>{s.stato}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      </div>
    </main>
  );
}

export function LavoroCommittente({ cm, onScegli }: { cm: Committente; onScegli: (s: Selezione) => void }) {
  return (
    <main className="lavori">
      <Testata etichetta="committente" titolo={cm.nome} sotto={`${cm.progetti.length} progetti · creato ${giorno(cm.creato_il)}`} />
      <div className="corpo-lavoro">
        <section className="sezione">
          <Etichetta>progetti</Etichetta>
          {cm.progetti.length === 0 ? <Vuoto>Nessun progetto. Crealo dalla scheda a destra, oppure con /cantiere collega da Claude Code.</Vuoto> : (
            <div className="righe">
              {cm.progetti.map((p) => {
                const n = (s: Cantiere["stato"]) => p.cantieri.filter((c) => c.stato === s).length;
                return (
                  <button key={p.id} className="riga-progetto" onClick={() => onScegli({ tipo: "progetto", id: p.id })}>
                    <span className="nome">{p.nome}</span>
                    <span className="secondario">{n("aperto")} in corso · {n("idea")} idee · {n("completato")} completati</span>
                    <span className="secondario">{p.non_censite} non censite</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
