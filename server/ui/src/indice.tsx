// Colonna sinistra: un livello alla volta (committenti → progetti → cantieri), richiudibile nella rotaia «sfoglia».
// Qui anche il percorso che sta sopra il titolo del centro, e come una scelta si traduce in livello e percorso.
import type { Cantiere, Committente, Progetto } from "./api.ts";
import { Logo } from "./ds/brand.tsx";
import { Button, Tabs } from "./ds/core.tsx";
import { StatoBadge } from "./ds/feedback.tsx";
import { ora, profondita, VISTA_DI, type Vista } from "./formato.ts";
import { lingua, T, type Lingua } from "./testi.ts";
import { BottoneIcona, Etichetta, Icona, Pallino, Vuoto } from "./ui.tsx";

export type Selezione = { tipo: "committente" | "progetto" | "cantiere"; id: number };
/** Il livello che la colonna mostra: i committenti, i progetti di uno, i cantieri di un progetto. */
export type Posizione = { livello: "committenti" } | { livello: "progetti"; cm: number } | { livello: "cantieri"; cm: number; p: number };
/** Colonna aperta, puntina accesa (la colonna non si chiude da sola), scheda tecnica aperta. */
export type Colonne = { colonna: boolean; fissata: boolean; scheda: boolean };
/** Un pezzo del percorso; senza `scelta` è quello corrente. */
export type Segmento = { testo: string; scelta?: Selezione };

export type Trovato =
  | { tipo: "committente"; cm: Committente }
  | { tipo: "progetto"; cm: Committente; p: Progetto }
  | { tipo: "cantiere"; cm: Committente; p: Progetto; c: Cantiere };

export function trova(albero: Committente[], s: Selezione | null): Trovato | null {
  if (!s) return null;
  for (const cm of albero) {
    if (s.tipo === "committente" && cm.id === s.id) return { tipo: "committente", cm };
    for (const p of cm.progetti) {
      if (s.tipo === "progetto" && p.id === s.id) return { tipo: "progetto", cm, p };
      const c = s.tipo === "cantiere" ? p.cantieri.find((x) => x.id === s.id) : undefined;
      if (c) return { tipo: "cantiere", cm, p, c };
    }
  }
  return null;
}

/** Dove sta la colonna per una scelta: sui progetti del committente scelto, o sui cantieri del progetto. */
export function posizioneDi(t: Trovato | null): Posizione {
  if (!t) return { livello: "committenti" };
  return t.tipo === "committente" ? { livello: "progetti", cm: t.cm.id } : { livello: "cantieri", cm: t.cm.id, p: t.p.id };
}

/** Committente, progetto, i padri del cantiere e il cantiere: tutti cliccabili tranne l'ultimo. */
export function segmentiDi(t: Trovato): Segmento[] {
  const scelta = (tipo: Selezione["tipo"], id: number): Selezione => ({ tipo, id });
  if (t.tipo === "committente") return [{ testo: t.cm.nome }];
  const su = [{ testo: t.cm.nome, scelta: scelta("committente", t.cm.id) }];
  if (t.tipo === "progetto") return [...su, { testo: t.p.nome }];
  const padri: Segmento[] = [];
  for (let x = t.p.cantieri.find((y) => y.id === t.c.padre_id); x; x = t.p.cantieri.find((y) => y.id === x!.padre_id)) {
    padri.unshift({ testo: x.nome, scelta: scelta("cantiere", x.id) });
  }
  return [...su, { testo: t.p.nome, scelta: scelta("progetto", t.p.id) }, ...padri, { testo: t.c.nome }];
}

/** L'indirizzo di una scelta: `#/committente/progetto/padre/cantiere`, un nome per segmento (i nomi non hanno `/`). */
export function hashDi(t: Trovato): string {
  const nomi = [t.cm.nome, ...(t.tipo === "committente" ? [] : [t.p.nome]), ...(t.tipo === "cantiere" ? t.c.percorso.split("/") : [])];
  return "#/" + nomi.map(encodeURIComponent).join("/");
}

/** La scelta scritta in un indirizzo, se c'è ancora nell'albero. */
export function selezioneDaHash(albero: Committente[], hash: string): Selezione | null {
  let nomi: string[];
  try {
    nomi = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null; // codifica rotta (`%E0`): vale come un indirizzo senza scelta
  }
  const cm = albero.find((x) => x.nome === nomi[0]);
  if (!cm) return null;
  if (nomi.length === 1) return { tipo: "committente", id: cm.id };
  const p = cm.progetti.find((x) => x.nome === nomi[1]);
  if (!p) return null;
  if (nomi.length === 2) return { tipo: "progetto", id: p.id };
  const c = p.cantieri.find((x) => x.percorso === nomi.slice(2).join("/"));
  return c ? { tipo: "cantiere", id: c.id } : null;
}

const PROFONDITA = { committenti: 0, progetti: 1, cantieri: 2 } as const;

export const stessa = (a: Selezione | null, b: Selezione) => a?.tipo === b.tipo && a.id === b.id;

const domandeDi = (cm: Committente) => cm.progetti.reduce((n, p) => n + p.domande_in_attesa, 0);

/** Ordine per segmenti, così i figli seguono subito il padre (`a/b` dopo `a`, prima di `a-x`). */
function perPercorso(a: Cantiere, b: Cantiere): number {
  const x = a.percorso.split("/");
  const y = b.percorso.split("/");
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const c = x[i].localeCompare(y[i], lingua);
    if (c) return c;
  }
  return x.length - y.length;
}

/** Dalla pagina di un committente alla home: URL relativo, così regge il prefisso del proxy. */
const tornaAllaHome = () => window.location.assign("./");

function Voce({ attiva, rientro = 0, onClick, children, titolo }: {
  attiva: boolean; rientro?: number; onClick: () => void; children: React.ReactNode; titolo?: string;
}) {
  return (
    <button className={"voce" + (attiva ? " attiva" : "")} style={{ paddingLeft: 16 + rientro * 14 }} onClick={onClick} title={titolo} aria-current={attiva || undefined}>
      {children}
    </button>
  );
}

const Freccia = () => <span className="freccia"><Icona nome="avanti" /></span>;

/**
 * Testa del livello: «‹» con il pallino delle domande rimaste fuori da questo livello, etichetta, titolo con quello delle
 * domande che le righe sotto non mostrano, e conteggio.
 */
function TestaLivello({ indietro, etichetta, titolo, domande = 0, n, rif, doppioClic }: {
  indietro?: { testo: string; titolo: string; domande: number; onClick: () => void }; etichetta?: string; titolo: string; domande?: number; n: number;
  rif: React.Ref<HTMLHeadingElement>; doppioClic?: { titolo: string; onDoubleClick: () => void };
}) {
  return (
    <div className="livello-testa">
      {indietro && (
        <button className="indietro" onClick={indietro.onClick} title={indietro.titolo} aria-label={indietro.titolo}>
          <Icona nome="indietro" />{indietro.testo}<Pallino n={indietro.domande} />
        </button>
      )}
      {etichetta && <Etichetta>{etichetta}</Etichetta>}
      <h2 ref={rif} tabIndex={-1} className="livello-titolo" title={doppioClic?.titolo} onDoubleClick={doppioClic?.onDoubleClick}>
        {titolo}<Pallino n={domande} /><span className="conta">{n}</span>
      </h2>
    </div>
  );
}

export function Indice({ committenti, selezione, onScegli, posizione, onPosizione, vista, onVista, colonne, onColonne, ristretta, onNuovoCommittente, aggiornato, release, errore, onLingua }: {
  committenti: Committente[]; selezione: Selezione | null; onScegli: (s: Selezione) => void;
  posizione: Posizione; onPosizione: (p: Posizione) => void; vista: Vista; onVista: (v: Vista) => void;
  colonne: Colonne; onColonne: (c: Partial<Colonne>) => void;
  ristretta: boolean; onNuovoCommittente: () => void; aggiornato: string | null; release: string | null; errore: string | null; onLingua: (l: Lingua) => void;
}) {
  // Un committente o un progetto spariti (o non ancora caricati) riportano al livello sopra.
  const cm = posizione.livello === "committenti" ? undefined : committenti.find((x) => x.id === posizione.cm);
  const p = posizione.livello === "cantieri" ? cm?.progetti.find((x) => x.id === posizione.p) : undefined;
  const livello = p ? "cantieri" : cm ? "progetti" : "committenti";
  const chiave = `${livello}-${cm?.id}-${p?.id}`;
  // Il livello nuovo entra da destra quando si scende, da sinistra quando si torna su; la direzione cambia solo
  // con il livello, così un ridisegno qualunque (aggiornamento, dialogo) non rifà l'animazione.
  const entrata = React.useRef({ chiave, profondita: PROFONDITA[livello], daSinistra: false });
  if (entrata.current.chiave !== chiave) {
    entrata.current = { chiave, profondita: PROFONDITA[livello], daSinistra: PROFONDITA[livello] < entrata.current.profondita };
  }
  // Cambiando livello, o chiudendo e aprendo la colonna, il bottone premuto sparisce: il fuoco va al titolo del livello
  // nuovo o a «sfoglia», invece di ricadere in cima alla pagina.
  const fuoco = React.useRef<"titolo" | "sfoglia" | null>(null);
  const titolo = React.useRef<HTMLHeadingElement>(null);
  const sfoglia = React.useRef<HTMLButtonElement>(null);
  const aperta = React.useRef(colonne.colonna);
  React.useEffect(() => {
    // Aperta da fuori (un segmento del percorso, che al telefono la colonna copre), prende il fuoco rimasto nel vuoto.
    if (colonne.colonna && !aperta.current && document.activeElement === document.body) fuoco.current = "titolo";
    aperta.current = colonne.colonna;
    const el =fuoco.current === "titolo" ? titolo.current : fuoco.current === "sfoglia" ? sfoglia.current : null;
    if (!el) return;
    el.focus();
    fuoco.current = null;
  }, [chiave, colonne.colonna]);
  const scendi = (s: Selezione) => { fuoco.current = "titolo"; onScegli(s); };
  const sali = (p: Posizione) => { fuoco.current = "titolo"; onPosizione(p); };
  const chiudi = () => { fuoco.current = "sfoglia"; onColonne({ colonna: false }); };

  const domande = committenti.reduce((n, x) => n + domandeDi(x), 0);
  const testoStato = errore ?? (release ? T.release(release) : T.caricamentoMin);
  const stato = (
    <span className={"connessione" + (errore ? " errore" : "")} title={aggiornato ? T.aggiornatoAlle(ora(aggiornato)) : testoStato}>{testoStato}</span>
  );
  const logo = (
    <span onDoubleClick={ristretta ? tornaAllaHome : undefined} title={ristretta ? T.tornaAllaHome : undefined}><Logo size={22} wordmark={colonne.colonna} /></span>
  );

  if (!colonne.colonna) {
    return (
      <aside className="indice rotaia" aria-label={T.indice}>
        {logo}
        <button ref={sfoglia} className="sfoglia" onClick={() => { fuoco.current = "titolo"; onColonne({ colonna: true }); }} title={T.apriColonna} aria-label={T.apriColonna}>
          <Icona nome="apriColonna" /><span className="verticale" aria-hidden="true">{T.sfoglia}</span>
        </button>
        <Pallino n={domande} />
        {stato}
      </aside>
    );
  }

  const scegliCantiere = (c: Cantiere) => {
    onScegli({ tipo: "cantiere", id: c.id });
    if (!colonne.fissata) chiudi();
  };
  let contenuto: React.ReactNode;
  if (p && cm) {
    // Il pallino conta le domande proprie dei cantieri del filtro: con quelle dei figli, un padre aperto conterebbe un figlio chiuso.
    // Quelle delle sessioni senza cantiere vanno sul titolo.
    const proprie = (cs: Cantiere[]) => cs.reduce((n, c) => n + c.domande.length, 0);
    const filtro = (id: Vista, testo: string) => {
      const dentro = p.cantieri.filter((c) => VISTA_DI[c.stato] === id);
      return { id, label: <>{testo}<Pallino n={proprie(dentro)} /></>, count: dentro.length };
    };
    const visibili = p.cantieri.filter((c) => VISTA_DI[c.stato] === vista).sort(perPercorso);
    const ids = new Set(visibili.map((c) => c.id));
    contenuto = (
      <>
        <TestaLivello rif={titolo} etichetta={T.cantieriDi} titolo={p.nome} domande={p.domande_in_attesa - proprie(p.cantieri)} n={p.cantieri.length}
          indietro={{ testo: cm.nome, titolo: T.tornaAProgettiDi(cm.nome), domande: domande - p.domande_in_attesa, onClick: () => sali({ livello: "progetti", cm: cm.id }) }} />
        <div className="filtri-livello">
          <Tabs value={vista} onChange={onVista} items={[filtro("aperti", T.aperti), filtro("idee", T.idee), filtro("chiusi", T.chiusi)]} />
        </div>
        <nav className="lista-livello" aria-label={T.cantieriDi + " " + p.nome}>
          {visibili.length === 0 && <Vuoto>{T.nessunoInVista[vista]}</Vuoto>}
          {visibili.map((c) => {
            // Un figlio il cui padre sta in un altro filtro mostra il percorso intero.
            const orfano = c.padre_id != null && !ids.has(c.padre_id);
            return (
              <Voce key={c.id} rientro={orfano ? 0 : profondita(c)} titolo={c.percorso}
                attiva={stessa(selezione, { tipo: "cantiere", id: c.id })} onClick={() => scegliCantiere(c)}>
                <StatoBadge stato={c.stato} etichetta={false} />
                <span className="nome-cantiere">{orfano ? c.percorso : c.nome}</span>
                <Pallino n={c.domande_in_attesa} />
                {c.task && <span className="a-destra">{c.task.fatti}/{c.task.totali}</span>}
                {c.sessioni.length > 0 && <span className="a-destra" title={T.sessioniAttive}>{c.sessioni.length}</span>}
              </Voce>
            );
          })}
        </nav>
      </>
    );
  } else if (cm) {
    // Il doppio clic per la pagina del committente sta sul titolo: la riga del committente sparisce al primo clic.
    contenuto = (
      <>
        <TestaLivello rif={titolo} etichetta={T.progettiDi} titolo={cm.nome} n={cm.progetti.length}
          indietro={{ testo: T.committenti, titolo: T.tornaACommittenti, domande: domande - domandeDi(cm), onClick: () => sali({ livello: "committenti" }) }}
          doppioClic={ristretta ? { titolo: T.tornaAllaHome, onDoubleClick: tornaAllaHome }
            : { titolo: T.paginaCommittente, onDoubleClick: () => window.location.assign(encodeURIComponent(cm.nome)) }} />
        <nav className="lista-livello" aria-label={T.progettiDi + " " + cm.nome}>
          {cm.progetti.length === 0 && <Vuoto>{T.nessunProgetto}</Vuoto>}
          {cm.progetti.map((x) => (
            <Voce key={x.id} attiva={stessa(selezione, { tipo: "progetto", id: x.id })} onClick={() => scendi({ tipo: "progetto", id: x.id })}>
              <span className="nome-progetto">{x.nome}</span>
              <Pallino n={x.domande_in_attesa} />
              {x.non_censite > 0 && <span className="a-destra" title={T.attivitaNonCensite}>{T.nonCensiteN(x.non_censite)}</span>}
              <span className="a-destra" title={T.aperti}>{x.cantieri.filter((c) => VISTA_DI[c.stato] === "aperti").length}</span>
              <Freccia />
            </Voce>
          ))}
        </nav>
      </>
    );
  } else {
    contenuto = (
      <>
        <TestaLivello rif={titolo} titolo={T.committenti} n={committenti.length} />
        <nav className="lista-livello" aria-label={T.committenti}>
          {committenti.length === 0 && <Vuoto>{T.nessunCommittente} {ristretta ? "" : T.creaPrimoCommittente}</Vuoto>}
          {committenti.map((x) => (
            <Voce key={x.id} attiva={stessa(selezione, { tipo: "committente", id: x.id })} onClick={() => scendi({ tipo: "committente", id: x.id })}>
              <span className="nome-committente">{x.nome}</span>
              <Pallino n={domandeDi(x)} />
              <span className="a-destra">{x.progetti.length}</span>
              <Freccia />
            </Voce>
          ))}
        </nav>
      </>
    );
  }

  return (
    <aside className="indice" aria-label={T.indice}>
      <div className="indice-testa">
        {logo}
        <span role="group" aria-label={T.lingua} className="lingue">
          {(["it", "en"] as const).map((l) => (
            <Button key={l} variant={l === lingua ? "secondario" : "fantasma"} size="sm" onClick={() => onLingua(l)}>{l.toUpperCase()}</Button>
          ))}
        </span>
        <span className="puntina"><BottoneIcona icona="puntina" titolo={T.tieniAperta} premuto={colonne.fissata} onClick={() => onColonne({ fissata: !colonne.fissata })} /></span>
        <BottoneIcona icona="chiudiColonna" titolo={T.chiudiColonna} onClick={chiudi} />
      </div>
      <section key={chiave} className={"livello" + (entrata.current.daSinistra ? " da-sinistra" : "")}>{contenuto}</section>
      <div className="indice-piede">
        {!ristretta && <Button variant="secondario" size="sm" onClick={onNuovoCommittente} style={{ width: "100%" }}>{T.nuovoCommittente}</Button>}
        {stato}
      </div>
    </aside>
  );
}

// Un segmento cliccato fa cambiare pagina al centro, e il percorso rinasce: il fuoco va al segmento corrente nuovo.
let fuocoAlPercorso = false;

/** Il percorso sopra il titolo del centro: ogni segmento tranne l'ultimo sceglie quel livello. */
export function Percorso({ segmenti, onScegli }: { segmenti: Segmento[]; onScegli: (s: Selezione) => void }) {
  const corrente = React.useRef<HTMLSpanElement>(null);
  const ultimo = segmenti[segmenti.length - 1]?.testo;
  React.useEffect(() => {
    if (!fuocoAlPercorso) return;
    fuocoAlPercorso = false;
    corrente.current?.focus();
  }, [ultimo]);
  return (
    <nav className="percorso" aria-label={T.percorso}>
      <ol>
        {segmenti.map((s, i) => (
          // Il separatore chiude il segmento: andando a capo resta a fine riga, non in testa alla riga dopo.
          <li key={i}>
            {s.scelta
              ? <button onClick={() => { fuocoAlPercorso = true; onScegli(s.scelta!); }}>{s.testo}</button>
              : <span ref={corrente} tabIndex={-1} aria-current="page">{s.testo}</span>}
            {i < segmenti.length - 1 && <span className="sep" aria-hidden="true">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
