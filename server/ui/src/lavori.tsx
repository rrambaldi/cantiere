// Colonna centrale: task da fare, giornale e change di un cantiere, oppure il quadro di un progetto o di un committente.
import type { ReactNode } from "react";
import type { Cantiere, Committente, Dettaglio, Domanda, FileCopia, NonCensita, Progetto, Turno } from "./api.ts";
import { Binari } from "./binari.tsx";
import { ComandiSessione, EsitoDomanda, VerificaTask } from "./comandi.tsx";
import { Documento, EditorMarkdown, RigaMarkdown } from "./documento.tsx";
import { Nastro } from "./ds/cantiere.tsx";
import { Button, Checkbox, Input, Tabs } from "./ds/core.tsx";
import { SessioneBadge, StatoBadge } from "./ds/feedback.tsx";
import { eta, giorno, ora, quando } from "./formato.ts";
import type { Selezione } from "./indice.tsx";
import { TaskERami } from "./rami.tsx";
import { T } from "./testi.ts";
import { Avanzamento, Avviso, BottoneIcona, Etichetta, Pallino, ricorda, ricordato, Vuoto } from "./ui.tsx";

const FILE_AMMESSI = ".md,.txt,text/markdown,text/plain";

/** `barra`: il percorso e il bottone della scheda, sopra l'etichetta. */
function Testata({ etichetta, titolo, sotto, barra }: { etichetta: string; titolo: string; sotto: ReactNode; barra?: ReactNode }) {
  return (
    <>
      <Nastro altezza={6} />
      <header className="testata griglia">
        {barra}
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

function Turni({ turni, vuoto }: { turni: Turno[]; vuoto: string }) {
  if (!turni.length) return <Vuoto>{vuoto}</Vuoto>;
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

function BottoneCopia({ testo }: { testo: string }) {
  const [riuscita, setRiuscita] = React.useState<boolean | null>(null);
  const copia = () => navigator.clipboard.writeText(testo).then(() => setRiuscita(true), () => setRiuscita(false));
  React.useEffect(() => {
    if (riuscita === null) return;
    const t = setTimeout(() => setRiuscita(null), 2000);
    return () => clearTimeout(t);
  }, [riuscita]);
  const esito = riuscita === null ? null : riuscita ? T.copiato : T.copiaNonRiuscita;
  return (
    <>
      <BottoneIcona icona={riuscita === null ? "copia" : riuscita ? "fatto" : "chiudi"} titolo={esito ?? T.copiaAppunti} onClick={copia} />
      <span className="solo-lettori" role="status">{esito}</span>
    </>
  );
}

const PREFISSO_IDEA = "idee/";
const nomeIdea = (f: FileCopia) => (f.percorso.startsWith(PREFISSO_IDEA) ? f.percorso.slice(PREFISSO_IDEA.length) : f.percorso);

/** Scarica il file con il suo percorso come nome: specs/a/spec.md diventa specs-a-spec.md. */
function salva(f: FileCopia) {
  const tipo = f.percorso.endsWith(".txt") ? "text/plain" : "text/markdown";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([f.contenuto], { type: tipo + ";charset=utf-8" }));
  a.download = nomeIdea(f).replace(/\//g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href));
}

/**
 * Bozze aperte, una per cantiere: cambiando cantiere e tornando il testo scritto è ancora lì.
 * ParceEtRecte: stanno nella memoria della pagina; se servono anche dopo un ricaricamento, sessionStorage.
 */
const BOZZE = new Map<number, FileCopia>();
// Chiudendo o ricaricando la pagina con una bozza aperta il browser chiede conferma. Nei test non c'è window.
globalThis.addEventListener?.("beforeunload", (e) => { if (BOZZE.size) e.preventDefault(); });

/** Elenco dei file e il file scelto, formattato. */
function Documenti({ file, vuoto, azioni, modifica }: {
  file: FileCopia[]; vuoto: ReactNode; azioni?: (f: FileCopia) => ReactNode;
  /** Solo per i file delle idee: quelli del change sono la copia del repo. `salva` dice se è riuscito. */
  modifica?: { cantiere: number; salva: (f: FileCopia, testo: string) => Promise<boolean> };
}) {
  const ordinati = [...file].sort((a, b) => rango(a.percorso) - rango(b.percorso) || a.percorso.localeCompare(b.percorso));
  const [bozza, setBozzaStato] = React.useState<FileCopia | null>(() => (modifica && BOZZE.get(modifica.cantiere)) ?? null);
  const [scelto, setScelto] = React.useState<string | null>(bozza?.percorso ?? null);
  const [salvando, setSalvando] = React.useState(false);
  const setBozza = (b: FileCopia | null) => {
    if (modifica) b ? BOZZE.set(modifica.cantiere, b) : BOZZE.delete(modifica.cantiere);
    setBozzaStato(b);
  };
  const corrente = ordinati.find((f) => f.percorso === scelto) ?? ordinati[0];
  if (!corrente) return <Vuoto>{vuoto}</Vuoto>;
  const inModifica = modifica && bozza?.percorso === corrente.percorso ? bozza : null;
  // Se il salvataggio non riesce la bozza resta aperta; mentre salva, il testo e gli altri file restano fermi.
  const salvaBozza = async (b: FileCopia) => {
    const { cantiere, salva } = modifica!;
    setSalvando(true);
    try {
      // Se intanto la bozza è cambiata (dalla barra dell'editor, o uscendo e rientrando), resta aperta col testo nuovo.
      if (!(await salva(corrente, b.contenuto)) || BOZZE.get(cantiere) !== b) return;
      BOZZE.delete(cantiere);
      setBozzaStato(null);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="documenti">
      <ul className="elenco-file">
        {ordinati.map((f) => (
          <li key={f.percorso}>
            <button className={"voce-file" + (f === corrente ? " attiva" : "")} onClick={() => setScelto(f.percorso)}
              disabled={!!inModifica && f !== corrente}>{f.percorso}</button>
          </li>
        ))}
      </ul>
      <article className="documento">
        <div className="documento-testa">
          <code>{corrente.percorso}</code>
          <span className="azioni-documento">
            {inModifica ? (
              <>
                <BottoneIcona icona="fatto" titolo={T.salvaModifiche} onClick={() => void salvaBozza(inModifica)} disabled={salvando} />
                <BottoneIcona icona="chiudi" titolo={T.annulla} onClick={() => setBozza(null)} disabled={salvando} />
              </>
            ) : (
              <>
                {modifica && <BottoneIcona icona="modifica" titolo={T.modificaFile} onClick={() => setBozza(corrente)} />}
                <BottoneCopia key={corrente.percorso} testo={corrente.contenuto} />
                <BottoneIcona icona="scarica" titolo={T.salvaFile} onClick={() => salva(corrente)} />
                {azioni?.(corrente)}
              </>
            )}
          </span>
        </div>
        {inModifica
          ? <EditorMarkdown valore={inModifica.contenuto} onCambia={(testo) => setBozza({ ...inModifica, contenuto: testo })} fermo={salvando}
              etichetta={`${T.modificaFile} ${corrente.percorso}`} />
          : <Documento percorso={corrente.percorso} contenuto={corrente.contenuto} />}
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

type Scheda = "daFare" | "rami" | "giornale" | "change";

export function LavoroCantiere({ d, cantieri, onScegli, onFile, onSalvaFile, onTogliFile, onAggiorna, barra }: {
  d: Dettaglio; onFile: (f: File[]) => void; onTogliFile: (nome: string) => void; barra?: ReactNode;
  /** Ricarica i dati dopo un comando o un esito dato dalla dashboard. */
  onAggiorna: () => Promise<unknown>;
  /** Tutti i cantieri dell'albero: servono per i rami in uscita e per lo stato di quelli legati. */
  cantieri: Cantiere[];
  onScegli: (s: Selezione) => void;
  /** Salva il testo modificato di un file dell'idea; dice se è riuscito. */
  onSalvaFile: (nome: string, testo: string) => Promise<boolean>;
}) {
  const c = d.cantiere;
  const idea = c.stato === "idea";
  const daFare = d.task_aperti.length > 0;
  const prima: Scheda = daFare ? "daFare" : "giornale";
  const [scheda, setScheda] = React.useState<Scheda>(prima);
  React.useEffect(() => setScheda(prima), [c.id]);
  // Spuntato l'ultimo task, la scheda «Da fare» sparisce: si torna al giornale.
  const vista = scheda === "daFare" && !daFare ? "giornale" : scheda;
  const macchine = new Set(d.turni.map((t) => t.host)).size;
  const legati = c.nato_da.length + cantieri.filter((x) => x.nato_da.some((l) => l.id === c.id)).length;
  // Un'idea con la copia di un change archiviato con lo stesso nome mostra quella: si modificano e si tolgono solo i file dell'idea.
  const fileIdea = d.file.every((f) => f.percorso.startsWith(PREFISSO_IDEA));
  // Una bozza vive finché il suo file si può modificare: con l'idea abbandonata o presa, o il file tolto altrove, il
  // server non la accetterebbe più e il browser non deve chiedere conferma per un testo che non si vede.
  const bozzaValida = idea && fileIdea && d.file.some((f) => f.percorso === BOZZE.get(c.id)?.percorso);
  // A ogni render: la bozza nasce dentro Documenti, senza che questo componente lo sappia.
  React.useEffect(() => { if (!bozzaValida) BOZZE.delete(c.id); });
  const sotto = [
    c.progetto,
    T.changeNome(c.change),
    T.stato[c.stato],
    T.creatoIl(giorno(c.creato_il)),
    ...(idea ? [] : [d.turni.length ? T.turniSu(d.turni.length, macchine) : T.nessunTurno]),
  ].join(" · ");
  return (
    <main className="lavori">
      <Testata etichetta={idea ? T.stato.idea : T.giornaleLavori} titolo={c.percorso} sotto={sotto} barra={barra} />
      <div className="corpo-lavoro">
        {c.descrizione && <p className="descrizione">{c.descrizione}</p>}
        <DomandeInAttesa domande={c.domande} onAggiorna={onAggiorna} />
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
            {/* La chiave tiene la bozza di un'idea lontana dai file con lo stesso nome di un'altra. */}
            <Documenti key={c.id} file={d.file} vuoto={T.nessunFileIdea}
              modifica={fileIdea ? { cantiere: c.id, salva: (f, testo) => onSalvaFile(nomeIdea(f), testo) } : undefined}
              azioni={fileIdea ? (f) => <BottoneIcona icona="cestino" titolo={T.togli} onClick={() => onTogliFile(nomeIdea(f))} /> : undefined} />
          </>
        ) : (
          <>
            <Tabs value={vista} onChange={setScheda} items={[
              ...(daFare ? [{ id: "daFare" as const, label: T.daFareScheda, count: d.task_aperti.length }] : []),
              { id: "rami", label: T.taskERami, count: legati },
              { id: "giornale", label: T.giornale, count: d.turni.length },
              { id: "change", label: T.changeScheda, count: d.file.length },
            ]} />
            {vista === "daFare"
              ? (
                <ul className="task-aperti">
                  {d.task_aperti.map((t, i) => (
                    <li key={i}>
                      <Checkbox checked={false} label={<RigaMarkdown testo={t} />} />
                      {/* Gli esiti sono dal più recente: il primo non annullato è quello che conta. */}
                      {d.verifiche.includes(t) && <VerificaTask cantiere={c.id} task={t} onAggiorna={onAggiorna}
                        esito={d.comandi.find((x) => x.task === t && x.stato !== "annullato")} />}
                    </li>
                  ))}
                </ul>
              )
              : vista === "rami"
              ? <TaskERami c={c} tasks={d.file.find((f) => f.percorso === "tasks.md")?.contenuto ?? null} cantieri={cantieri} onScegli={onScegli} />
              : vista === "giornale"
              ? <Turni turni={d.turni} vuoto={c.origine === "repo" ? T.nessunResocontoRepo(quando(c.creato_il)) : T.nessunResoconto} />
              : <Documenti file={d.file} vuoto={T.nessunaCopiaChange} />}
          </>
        )}
      </div>
    </main>
  );
}

/** Le domande che le sessioni hanno fatto e che aspettano risposta: dal web si confermano o si negano con un feedback. */
function DomandeInAttesa({ domande, onAggiorna }: { domande: Domanda[]; onAggiorna: () => Promise<unknown> }) {
  if (!domande.length) return null;
  return (
    <section className="domande-attesa" aria-label={T.inAttesaTitolo}>
      <Etichetta><Pallino n={1} /> {T.inAttesaTitolo}</Etichetta>
      {domande.map((d) => (
        <article key={d.session_id + d.id} className="domanda">
          <p className="testo-domanda">{d.tipo === "attesa" && !d.testo ? T.domandaAttesa : d.testo}</p>
          {d.opzioni.length > 0 && <ul className="opzioni-domanda">{d.opzioni.map((o, i) => <li key={i}>{o}</li>)}</ul>}
          <span className="secondario">{d.host} · <code>{d.session_id.slice(0, 8)}</code> · {T.inAttesaDa(eta(d.eta_secondi))}</span>
          <EsitoDomanda d={d} onAggiorna={onAggiorna} />
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
function RigaNonCensita({ s, onAggiorna }: { s: NonCensita; onAggiorna: () => Promise<unknown> }) {
  const [aperta, setAperta] = React.useState(false);
  const u = s.ultimo_stato;
  return (
    <>
      <tr className="apribile" tabIndex={0} title={T.apriUltimoStato} aria-expanded={aperta}
        onDoubleClick={() => setAperta(!aperta)} onKeyDown={(e) => e.key === "Enter" && setAperta(!aperta)}
        onMouseDown={(e) => e.detail > 1 && e.preventDefault()}>
        <td>{s.titolo ?? <span className="secondario">{T.sessione} {s.session_id.slice(0, 8)}</span>} <Pallino n={s.domande.length} /></td>
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
            {s.stato !== "chiusa" && <ComandiSessione sessionId={s.session_id} comandi={s.comandi} onAggiorna={onAggiorna} />}
          </td>
        </tr>
      )}
    </>
  );
}

export function LavoroProgetto({ p, committente, nonCensite, onScegli, onAggiorna, barra }: {
  p: Progetto; committente: string; nonCensite: NonCensita[] | null; onScegli: (s: Selezione) => void; onAggiorna: () => Promise<unknown>; barra?: ReactNode;
}) {
  const attivi = p.cantieri.filter((c) => c.stato === "aperto" || c.stato === "sospeso" || c.stato === "idea");
  return (
    <main className="lavori">
      <Testata etichetta={T.progetto} titolo={p.nome} sotto={T.progettoSotto(committente, p.cantieri.length, giorno(p.creato_il))} barra={barra} />
      <div className="corpo-lavoro">
        {/* Le domande del lavoro fatto senza cantiere: quelle dei cantieri stanno nelle loro schede. */}
        {nonCensite && <DomandeInAttesa domande={nonCensite.flatMap((s) => s.domande)} onAggiorna={onAggiorna} />}
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
                  <tbody>{nonCensite.map((s) => <RigaNonCensita key={s.session_id} s={s} onAggiorna={onAggiorna} />)}</tbody>
                </table>
              </div>
            )}
        </section>
      </div>
    </main>
  );
}

const CHIAVE_SCHEDA_COMMITTENTE = "forgia-scheda-committente";
type SchedaCommittente = "progetti" | "binari";

export function LavoroCommittente({ cm, onScegli, barra }: { cm: Committente; onScegli: (s: Selezione) => void; barra?: ReactNode }) {
  // Progetti o Binari restano come li si è lasciati, anche cambiando committente o ricaricando.
  const [scheda, setScheda] = React.useState<SchedaCommittente>(() => ricordato<string>(CHIAVE_SCHEDA_COMMITTENTE, "progetti") === "binari" ? "binari" : "progetti");
  const scegliScheda = (s: SchedaCommittente) => { ricorda(CHIAVE_SCHEDA_COMMITTENTE, s); setScheda(s); };
  return (
    <main className="lavori">
      <Testata etichetta={T.committente} titolo={cm.nome} sotto={T.committenteSotto(cm.progetti.length, giorno(cm.creato_il))} barra={barra} />
      <div className="corpo-lavoro">
        <Tabs value={scheda} onChange={scegliScheda} items={[
          { id: "progetti", label: T.progettiScheda, count: cm.progetti.length },
          { id: "binari", label: T.binari },
        ]} />
        {scheda === "binari" ? <Binari cm={cm} /> : (
        <section className="sezione">
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
        )}
      </div>
    </main>
  );
}
