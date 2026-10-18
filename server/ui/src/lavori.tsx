// Colonna centrale: giornale e change di un cantiere, oppure il quadro di un progetto o di un committente.
import type { ReactNode } from "react";
import type { Cantiere, Committente, Dettaglio, Domanda, FileCopia, NonCensita, Progetto, Turno } from "./api.ts";
import { Documento } from "./documento.tsx";
import { Nastro } from "./ds/cantiere.tsx";
import { Button, Input, Tabs } from "./ds/core.tsx";
import { SessioneBadge, StatoBadge } from "./ds/feedback.tsx";
import { eta, giorno, ora, quando } from "./formato.ts";
import type { Selezione } from "./indice.tsx";
import { T } from "./testi.ts";
import { Avanzamento, Avviso, Etichetta, Pallino, Vuoto } from "./ui.tsx";

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
  if (!turni.length) return <Vuoto>{T.nessunResoconto}</Vuoto>;
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
            <span className="etichetta">{t.titolo || T.sessione + " " + t.session_id.slice(0, 8)}{t.percentuale != null ? ` · ${t.percentuale}%` : ""}</span>
            <RigaResoconto k={T.rFatto} v={t.fatto} />
            <RigaResoconto k={T.rDopo} v={t.prossimo} />
            <RigaResoconto k={T.rBlocca} v={t.bloccato_da} />
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
export function fileDaTesto(nome: string, testo: string): File {
  const base = nome.trim().replace(/\.(md|txt)$/i, "") || "appunti";
  return new File([testo], `${base}.md`, { type: "text/markdown" });
}

export function CampoTesto({ scritto, setScritto, nome, setNome, azione }: {
  scritto: string; setScritto: (v: string) => void; nome: string; setNome: (v: string) => void; azione?: ReactNode;
}) {
  return (
    <>
      <Input label={T.scriviTesto} value={scritto} onChange={setScritto} multilinea />
      {scritto.trim() && (
        <div className="zona-file">
          <Input label={T.nomeAppunti} value={nome} onChange={setNome} />
          {azione}
        </div>
      )}
    </>
  );
}

export function ZonaFile({ onFile, testo = T.trascinaFile, conTesto = true }: {
  onFile: (f: File[]) => void; testo?: string; conTesto?: boolean;
}) {
  const [sopra, setSopra] = React.useState(false);
  const [scritto, setScritto] = React.useState("");
  const [nome, setNome] = React.useState("appunti");
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <div className={"zona-file" + (sopra ? " sopra" : "")}
        onDragOver={(e) => { e.preventDefault(); setSopra(true); }} onDragLeave={() => setSopra(false)}
        onDrop={(e) => { e.preventDefault(); setSopra(false); onFile([...e.dataTransfer.files]); }}>
        <span>{testo}</span>
        <Button variant="secondario" size="sm" onClick={() => input.current?.click()}>{T.scegliFile}</Button>
        <input ref={input} type="file" multiple accept={FILE_AMMESSI} hidden
          onChange={(e) => { onFile([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      {conTesto && <CampoTesto scritto={scritto} setScritto={setScritto} nome={nome} setNome={setNome}
        azione={<Button variant="secondario" size="sm" onClick={() => { onFile([fileDaTesto(nome, scritto)]); setScritto(""); }}>{T.aggiungiTesto}</Button>} />}
    </>
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
    T.changeNome(c.change),
    T.stato[c.stato],
    T.creatoIl(giorno(c.creato_il)),
    ...(idea ? [] : [d.turni.length ? T.turniSu(d.turni.length, macchine) : T.nessunTurno]),
  ].join(" · ");
  return (
    <main className="lavori">
      <Testata etichetta={idea ? T.stato.idea : T.giornaleLavori} titolo={c.percorso} sotto={sotto} />
      <div className="corpo-lavoro">
        {c.descrizione && <p className="descrizione">{c.descrizione}</p>}
        <DomandeInAttesa domande={c.domande} />
        {c.change_mancante && c.stato === "aperto" && (
          <Avviso>{T.avvisoChangeMancante[0]}<code>{c.change}</code>{T.avvisoChangeMancante[1]}<code>openspec new change {c.change}</code>{T.avvisoChangeMancante[2]}</Avviso>
        )}
        {c.da_archiviare && (
          <Avviso>{T.avvisoDaArchiviare(c.progetto)[0]}<code>openspec archive {c.change} --skip-specs</code>{T.avvisoDaArchiviare(c.progetto)[1]}</Avviso>
        )}
        {idea ? (
          <>
            <Etichetta>{T.fileIdea(d.file.length)}</Etichetta>
            <ZonaFile onFile={onFile} />
            <Documenti file={d.file} vuoto={T.nessunFileIdea}
              azioni={(f) => <Button variant="fantasma" size="sm" onClick={() => onTogliFile(f.percorso.replace(/^idee\//, ""))}>{T.togli}</Button>} />
          </>
        ) : (
          <>
            <Tabs value={scheda} onChange={setScheda} items={[
              { id: "giornale", label: T.giornale, count: d.turni.length },
              { id: "change", label: T.changeScheda, count: d.file.length },
            ]} />
            {scheda === "giornale"
              ? <Turni turni={d.turni} />
              : <Documenti file={d.file} vuoto={T.nessunaCopiaChange} />}
          </>
        )}
      </div>
    </main>
  );
}

/** Le domande che le sessioni del cantiere hanno fatto e che aspettano risposta (solo lettura). */
function DomandeInAttesa({ domande }: { domande: Domanda[] }) {
  if (!domande.length) return null;
  return (
    <section className="domande-attesa" aria-label={T.inAttesaTitolo}>
      <Etichetta><Pallino n={1} /> {T.inAttesaTitolo}</Etichetta>
      {domande.map((d) => (
        <article key={d.session_id + d.id} className="domanda">
          <p className="testo-domanda">{d.tipo === "attesa" && !d.testo ? T.domandaAttesa : d.testo}</p>
          {d.opzioni.length > 0 && <ul className="opzioni-domanda">{d.opzioni.map((o, i) => <li key={i}>{o}</li>)}</ul>}
          <span className="secondario">{d.host} · <code>{d.session_id.slice(0, 8)}</code> · {T.inAttesaDa(eta(d.eta_secondi))}</span>
        </article>
      ))}
      <span className="secondario">{T.inAttesaNota}</span>
    </section>
  );
}

function RigaCantiere({ c, onScegli }: { c: Cantiere; onScegli: (s: Selezione) => void }) {
  return (
    <button className="riga-cantiere" onClick={() => onScegli({ tipo: "cantiere", id: c.id })}>
      <span className="nome">{c.percorso} <Pallino n={c.domande_in_attesa} /></span>
      <span className="secondario">{c.sessioni.map((s) => s.host).join(" · ") || "—"}</span>
      {c.task ? <Avanzamento fatti={c.task.fatti} totali={c.task.totali} attivo={c.stato === "aperto"} /> : <span className="secondario">—</span>}
      <StatoBadge stato={c.stato} />
    </button>
  );
}

/** Doppio click (o Invio) apre sotto la riga l'ultimo messaggio di stato della sessione. */
function RigaNonCensita({ s }: { s: NonCensita }) {
  const [aperta, setAperta] = React.useState(false);
  const u = s.ultimo_stato;
  return (
    <>
      <tr className="apribile" tabIndex={0} title={T.apriUltimoStato} aria-expanded={aperta}
        onDoubleClick={() => setAperta(!aperta)} onKeyDown={(e) => e.key === "Enter" && setAperta(!aperta)}
        onMouseDown={(e) => e.detail > 1 && e.preventDefault()}>
        <td>{s.titolo ?? <span className="secondario">{T.sessione} {s.session_id.slice(0, 8)}</span>}</td>
        <td>{s.host}</td><td>{quando(s.avviata_il)}</td><td>{quando(s.ultimo_evento_il)}</td>
        <td className="numero">{s.turni}</td><td><SessioneBadge stato={s.stato} /></td>
      </tr>
      {aperta && (
        <tr className="ultimo-stato">
          <td colSpan={6}>
            {u ? (
              <div className="resoconto-sessione">
                <span className="etichetta">{T.ultimoStatoDel(quando(u.ts))}</span>
                <RigaResoconto k={T.rFatto} v={u.fatto} />
                <RigaResoconto k={T.rDopo} v={u.prossimo} />
                {u.bloccato_da && <RigaResoconto k={T.rBlocca} v={u.bloccato_da} />}
              </div>
            ) : <span className="secondario">{T.nessunoStato}</span>}
          </td>
        </tr>
      )}
    </>
  );
}

export function LavoroProgetto({ p, committente, nonCensite, onScegli }: {
  p: Progetto; committente: string; nonCensite: NonCensita[] | null; onScegli: (s: Selezione) => void;
}) {
  const attivi = p.cantieri.filter((c) => c.stato === "aperto" || c.stato === "sospeso" || c.stato === "idea");
  return (
    <main className="lavori">
      <Testata etichetta={T.progetto} titolo={p.nome} sotto={T.progettoSotto(committente, p.cantieri.length, giorno(p.creato_il))} />
      <div className="corpo-lavoro">
        <section className="sezione">
          <Etichetta>{T.cantieriApertiIdee}</Etichetta>
          {attivi.length ? <div className="righe">{attivi.map((c) => <RigaCantiere key={c.id} c={c} onScegli={onScegli} />)}</div>
            : <Vuoto>{T.nessunCantiereAperto}</Vuoto>}
        </section>
        <section className="sezione">
          <Etichetta>{T.attivitaNonCensite}</Etichetta>
          {nonCensite === null ? <Vuoto>{T.caricamento}</Vuoto> : nonCensite.length === 0
            ? <Vuoto>{T.nessunaNonCensita(p.nome)}</Vuoto>
            : (
              <div className="tabella-scorre">
                <table className="tabella">
                  <thead><tr><th>{T.colTitolo}</th><th>{T.colMacchina}</th><th>{T.colAvviata}</th><th>{T.colUltimoEvento}</th><th className="numero">{T.colTurni}</th><th>{T.colStato}</th></tr></thead>
                  <tbody>{nonCensite.map((s) => <RigaNonCensita key={s.session_id} s={s} />)}</tbody>
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
      <Testata etichetta={T.committente} titolo={cm.nome} sotto={T.committenteSotto(cm.progetti.length, giorno(cm.creato_il))} />
      <div className="corpo-lavoro">
        <section className="sezione">
          <Etichetta>{T.progetti}</Etichetta>
          {cm.progetti.length === 0 ? <Vuoto>{T.nessunProgetto}</Vuoto> : (
            <div className="righe">
              {cm.progetti.map((p) => {
                const n = (s: Cantiere["stato"]) => p.cantieri.filter((c) => c.stato === s).length;
                return (
                  <button key={p.id} className="riga-progetto" onClick={() => onScegli({ tipo: "progetto", id: p.id })}>
                    <span className="nome">{p.nome}</span>
                    <span className="secondario">{T.riepilogoProgetto(n("aperto"), n("idea"), n("completato"))}</span>
                    <span className="secondario">{T.nonCensiteN(p.non_censite)}</span>
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
