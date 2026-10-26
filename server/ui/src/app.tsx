// Ingresso della dashboard: dati, selezione, aggiornamento periodico e azioni.
import { api, committenteDellaPagina, type Azione, type Cantiere, type Committente, type Dettaglio, type NonCensita } from "./api.ts";
import { Dialoghi, type Esecutori, type Richiesta } from "./dialoghi.tsx";
import { Toast } from "./ds/feedback.tsx";
import { VISTA_DI, type Vista } from "./formato.ts";
import { hashDi, Indice, Percorso, posizioneDi, segmentiDi, selezioneDaHash, stessa, trova, type Colonne, type Posizione, type Selezione } from "./indice.tsx";
import { LavoroCantiere, LavoroCommittente, LavoroProgetto } from "./lavori.tsx";
import { Foglio, SchedaCantiere, SchedaCommittente, SchedaProgetto } from "./scheda.tsx";
import { impostaLingua, lingua as linguaCorrente, salvaLingua, T, type Lingua } from "./testi.ts";
import { BottoneIcona, Vuoto } from "./ui.tsx";

const CHIAVE_SELEZIONE = "forgia-selezione";
const CHIAVE_COLONNE = "forgia-colonne";
const COLONNE_PREDEFINITE: Colonne = { colonna: true, fissata: false, scheda: true };
const CHIUSE: Colonne = { colonna: false, fissata: false, scheda: false };
// La stessa soglia di forgia.css: sotto, la colonna aperta e la scheda coprono il centro.
const TELEFONO = matchMedia("(max-width:720px)");
const AGGIORNA_OGNI_MS = 30_000;
const FILE_AMMESSO = /\.(md|txt)$/i;

// Quel che il browser ricorda (scelta, colonne) è una comodità: senza storage si riparte dal valore predefinito.
function ricordato<V>(chiave: string, predefinito: V): V {
  try {
    return JSON.parse(localStorage.getItem(chiave) ?? "null") ?? predefinito;
  } catch {
    return predefinito;
  }
}
function ricorda(chiave: string, valore: unknown) {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
  } catch {
    /* storage non disponibile: il valore non resta, il resto funziona */
  }
}

/** All'apertura: il primo cantiere in corso, altrimenti il primo progetto, altrimenti il primo committente. */
function predefinita(albero: Committente[]): Selezione | null {
  const progetti = albero.flatMap((cm) => cm.progetti);
  const aperto = progetti.flatMap((p) => p.cantieri).find((c) => c.stato === "aperto");
  if (aperto) return { tipo: "cantiere", id: aperto.id };
  if (progetti[0]) return { tipo: "progetto", id: progetti[0].id };
  return albero[0] ? { tipo: "committente", id: albero[0].id } : null;
}

type Messaggio = { titolo: string; testo?: string; tono?: "info" | "errore" };

function App() {
  const ristretta = committenteDellaPagina();
  const [lingua, setLingua] = React.useState<Lingua>(linguaCorrente);
  impostaLingua(lingua); // prima dei figli, che leggono i testi correnti
  const [albero, setAlbero] = React.useState<Committente[] | null>(null);
  const [errore, setErrore] = React.useState<string | null>(null);
  const [aggiornato, setAggiornato] = React.useState<string | null>(null);
  const [release, setRelease] = React.useState<string | null>(null);
  const [selezione, setSelezione] = React.useState<Selezione | null>(() => ricordato(CHIAVE_SELEZIONE, null));
  const [vista, setVista] = React.useState<Vista>("aperti");
  // Al desktop colonna e scheda restano come le si lascia, anche al ricaricamento. Al telefono coprono il centro: ogni volta
  // che si entra (all'apertura, stringendo la finestra) si parte chiuse, senza puntina, e lì non si ricorda niente.
  const [telefono, setTelefono] = React.useState(TELEFONO.matches);
  const [alDesktop, setAlDesktop] = React.useState<Colonne>(() => ({ ...COLONNE_PREDEFINITE, ...ricordato(CHIAVE_COLONNE, {}) }));
  const [alTelefono, setAlTelefono] = React.useState(CHIUSE);
  const colonne = telefono ? alTelefono : alDesktop;
  // «‹» nella colonna torna su senza cambiare la scelta; a ogni scelta nuova la colonna segue di nuovo la scelta.
  const [tornatoSu, setTornatoSu] = React.useState<Posizione | null>(null);
  const [dettaglio, setDettaglio] = React.useState<Dettaglio | null>(null);
  const [nonCensite, setNonCensite] = React.useState<NonCensita[] | null>(null);
  const [richiesta, setRichiesta] = React.useState<Richiesta | null>(null);
  const [messaggio, setMessaggio] = React.useState<Messaggio | null>(null);
  const selezioneCorrente = React.useRef(selezione);
  selezioneCorrente.current = selezione;
  const alberoCorrente = React.useRef(albero);
  alberoCorrente.current = albero;

  /** Sceglie e, per un cantiere, porta il filtro della colonna sul suo stato. */
  const scegliIn = React.useCallback((alb: Committente[], s: Selezione) => {
    const t = trova(alb, s);
    if (t?.tipo === "cantiere") setVista(VISTA_DI[t.c.stato]);
    setSelezione(s);
  }, []);

  const hashLetto = React.useRef(false);
  const caricaAlbero = React.useCallback(async () => {
    try {
      const r = await api.albero(ristretta);
      setAlbero(r.committenti);
      // Al primo caricamento vince l'indirizzo: un link porta lì; la scelta ricordata vale per gli indirizzi senza.
      if (!hashLetto.current) {
        hashLetto.current = true;
        const s = selezioneDaHash(r.committenti, location.hash);
        if (s) scegliIn(r.committenti, s);
      }
      setRelease(r.release);
      setErrore(null);
      setAggiornato(new Date().toISOString());
    } catch (e) {
      setErrore((e as Error).message);
    }
  }, [ristretta, scegliIn]);

  const caricaSelezione = React.useCallback(async (s: Selezione | null) => {
    // Una risposta arrivata dopo un'altra scelta (un link, più Indietro di fila) non copre quella corrente.
    const ancora = () => s !== null && stessa(selezioneCorrente.current, s);
    try {
      if (s?.tipo === "cantiere") {
        const d = await api.cantiere(s.id);
        if (ancora()) setDettaglio(d);
      }
      if (s?.tipo === "progetto") {
        const r = await api.nonCensite(s.id);
        if (ancora()) setNonCensite(r.sessioni);
      }
    } catch (e) {
      setMessaggio({ titolo: T.datiNonCaricati, testo: (e as Error).message, tono: "errore" });
    }
  }, []);

  const aggiorna = React.useCallback(
    () => Promise.all([caricaAlbero(), caricaSelezione(selezioneCorrente.current)]),
    [caricaAlbero, caricaSelezione],
  );

  React.useEffect(() => void caricaAlbero(), [caricaAlbero]);

  React.useEffect(() => {
    document.documentElement.lang = lingua;
    document.title = T.titoloPagina;
  }, [lingua]);

  // Il lavoro in sottofondo non si anima: si aggiorna e basta, solo con la pagina visibile.
  React.useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void aggiorna(), AGGIORNA_OGNI_MS);
    return () => clearInterval(t);
  }, [aggiorna]);

  React.useEffect(() => {
    ricorda(CHIAVE_SELEZIONE, selezione);
    setNonCensite(null);
    setTornatoSu(null);
    void caricaSelezione(selezione);
  }, [selezione, caricaSelezione]);

  React.useEffect(() => {
    const segui = () => {
      setTelefono(TELEFONO.matches);
      setAlTelefono(CHIUSE);
    };
    TELEFONO.addEventListener("change", segui);
    return () => TELEFONO.removeEventListener("change", segui);
  }, []);
  React.useEffect(() => ricorda(CHIAVE_COLONNE, alDesktop), [alDesktop]);
  const cambiaColonne = (c: Partial<Colonne>) => (telefono ? setAlTelefono : setAlDesktop)((v) => ({ ...v, ...c }));
  const foglio = telefono && colonne.scheda;
  // Chiuso dalla X, dal velo o con Esc, il foglio rende il fuoco al bottone della testata com'è adesso (la pagina può
  // essere cambiata intanto); non quando si chiude perché la finestra si allarga, magari con un dialogo aperto.
  const interruttore = React.useRef<HTMLSpanElement>(null);
  const riprendiFuoco = React.useRef(false);
  const chiudiFoglio = () => {
    riprendiFuoco.current = true;
    cambiaColonne({ scheda: false });
  };
  React.useEffect(() => {
    if (foglio || !riprendiFuoco.current) return;
    riprendiFuoco.current = false;
    interruttore.current?.querySelector("button")?.focus();
  }, [foglio]);

  const trovato = albero ? trova(albero, selezione) : null;
  const tuttiICantieri = React.useMemo(() => (albero ?? []).flatMap((cm) => cm.progetti.flatMap((p) => p.cantieri)), [albero]);
  // Selezione sparita (o mai fatta): si sceglie quella predefinita.
  React.useEffect(() => {
    if (albero && !trovato) setSelezione(predefinita(albero));
  }, [albero, trovato]);

  React.useEffect(() => {
    if (!messaggio) return;
    const t = setTimeout(() => setMessaggio(null), messaggio.tono === "errore" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [messaggio]);

  const scegli = (s: Selezione) => (albero ? scegliIn(albero, s) : setSelezione(s));

  // La scelta sta nell'indirizzo. Una scelta nuova aggiunge un passo alla cronologia, così Indietro ci torna; la prima,
  // o la stessa con un nome cambiato, lo sostituisce. Indietro e Avanti cambiano l'indirizzo, e la scelta lo segue.
  const scrittaNellIndirizzo = React.useRef<Selezione | null>(null);
  React.useEffect(() => {
    const t = albero && trova(albero, selezione);
    if (!t || !selezione) return;
    const indirizzo = hashDi(t);
    if (location.hash !== indirizzo) {
      // Un indirizzo che dice già questa scelta in un'altra codifica si riscrive e basta, senza un passo in più.
      const passo = scrittaNellIndirizzo.current !== null && !stessa(scrittaNellIndirizzo.current, selezione)
        && !stessa(selezioneDaHash(albero, location.hash), selezione);
      if (passo) history.pushState(null, "", indirizzo);
      else history.replaceState(null, "", indirizzo);
    }
    scrittaNellIndirizzo.current = selezione;
  }, [albero, selezione]);

  React.useEffect(() => {
    const segui = () => {
      const alb = alberoCorrente.current;
      if (!alb) return;
      const s = selezioneDaHash(alb, location.hash);
      if (s) return scegliIn(alb, s);
      // Un indirizzo che non porta a niente (scritto a mano, il nome vecchio di un'idea rinominata) torna quello della scelta.
      const t = trova(alb, selezioneCorrente.current);
      if (t) history.replaceState(null, "", hashDi(t));
    };
    addEventListener("hashchange", segui);
    return () => removeEventListener("hashchange", segui);
  }, [scegliIn]);
  // Un segmento del percorso sceglie quel livello e riapre la colonna lì.
  const daPercorso = (s: Selezione) => {
    scegli(s);
    cambiaColonne({ colonna: true });
  };

  /** Carica i file uno per uno: uno rifiutato non ferma gli altri. */
  async function caricaFile(cantiere: number, file: File[]) {
    const errori: string[] = [];
    let caricati = 0;
    for (const f of file) {
      if (!FILE_AMMESSO.test(f.name)) {
        errori.push(T.soloMdTxt(f.name));
        continue;
      }
      try {
        await api.caricaFile(cantiere, f.name, await f.text());
        caricati++;
      } catch (e) {
        errori.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (errori.length) {
      setMessaggio({ titolo: `${T.fileCaricati(caricati)}, ${T.fileRifiutati(errori.length)}`, testo: errori.join(" · "), tono: "errore" });
    } else if (caricati) setMessaggio({ titolo: T.fileCaricati(caricati) });
  }

  async function salvaFile(cantiere: number, nome: string, testo: string) {
    try {
      await api.caricaFile(cantiere, nome, testo);
    } catch (e) {
      setMessaggio({ titolo: T.modificaNonSalvata, testo: `${nome}: ${(e as Error).message}`, tono: "errore" });
      return false;
    }
    setMessaggio({ titolo: T.modificaSalvata, testo: nome });
    await aggiorna();
    return true;
  }

  const esecutori: Esecutori = {
    async creaCommittente(nome) {
      const r = await api.creaCommittente(nome);
      await caricaAlbero();
      setSelezione({ tipo: "committente", id: r.committente.id });
      setRichiesta({ tipo: "token", committente: r.committente.nome, token: r.token });
    },
    async rigenera(cm) {
      const r = await api.rigeneraToken(cm.id);
      setRichiesta({ tipo: "token", committente: cm.nome, token: r.token });
      await caricaAlbero();
    },
    async creaProgetto(cm, nome) {
      const r = await api.creaProgetto(cm.id, nome);
      await caricaAlbero();
      setSelezione({ tipo: "progetto", id: r.progetto.id });
      setMessaggio({ titolo: T.progettoCreato, testo: `${cm.nome} · ${r.progetto.nome}` });
    },
    async creaIdea(p, nome, descrizione, padre, file) {
      const r = await api.creaIdea(p.id, { nome, descrizione, padre_id: padre });
      setMessaggio({ titolo: T.ideaCreata, testo: r.cantiere.percorso });
      await caricaFile(r.cantiere.id, file);
      await caricaAlbero();
      setVista("idee");
      setSelezione({ tipo: "cantiere", id: r.cantiere.id });
    },
    async modifica(c, nome, descrizione) {
      await api.modificaIdea(c.id, { nome, descrizione });
      await aggiorna();
    },
    async esito(c, azione) {
      await api.esito(c.id, azione);
      await aggiorna();
      const testi: Record<Azione, Messaggio> = {
        sospendi: { titolo: T.cantiereSospeso, testo: c.percorso },
        riattiva: { titolo: T.cantiereRiattivato, testo: c.percorso },
        abbandona: {
          titolo: T.cantiereAbbandonato,
          testo: c.stato === "idea" ? c.percorso : T.proporraArchiviare(c.percorso, c.progetto),
        },
      };
      setMessaggio(testi[azione]);
      setVista(azione === "abbandona" ? "chiusi" : "aperti");
    },
    async togli(c, nome) {
      await api.togliFile(c.id, nome);
      await aggiorna();
    },
  };

  // Una finestra si chiude solo se è ancora lei quella aperta: "crea" e "rigenera" la sostituiscono con il token.
  const chiudi = (r: Richiesta) => () => setRichiesta((attuale) => (attuale === r ? null : attuale));
  const dettaglioDi = (c: Cantiere) => (dettaglio?.cantiere.id === c.id ? dettaglio : null);

  const barra = trovato && (
    <div className="barra-testata">
      <Percorso segmenti={segmentiDi(trovato)} onScegli={daPercorso} />
      <span ref={interruttore}>
        <BottoneIcona icona={colonne.scheda ? "chiudiScheda" : "apriScheda"} titolo={colonne.scheda ? T.chiudiScheda : T.apriScheda}
          onClick={() => cambiaColonne({ scheda: !colonne.scheda })} />
      </span>
    </div>
  );
  let centro: React.ReactNode = <main className="lavori"><Vuoto>{albero ? T.scegliQualcosa : errore ?? T.caricamento}</Vuoto></main>;
  let destra: React.ReactNode = <aside className="scheda" />;
  if (trovato?.tipo === "cantiere") {
    const d = dettaglioDi(trovato.c);
    if (d) {
      centro = <LavoroCantiere d={d} barra={barra} cantieri={tuttiICantieri} onScegli={scegli} onFile={(f) => void caricaFile(d.cantiere.id, f).then(aggiorna)}
        onSalvaFile={(nome, testo) => salvaFile(d.cantiere.id, nome, testo)}
        onTogliFile={(nome) => setRichiesta({ tipo: "togli", cantiere: d.cantiere, nome })} />;
      destra = <SchedaCantiere d={d}
        onEsito={(azione) => setRichiesta({ tipo: "esito", cantiere: d.cantiere, azione, discendenti: d.discendenti_attivi })}
        onModifica={() => setRichiesta({ tipo: "modifica", cantiere: d.cantiere })}
        onNuovaIdea={() => setRichiesta({ tipo: "idea", progetto: trovato.p, padre: d.cantiere })} />;
    }
  } else if (trovato?.tipo === "progetto") {
    centro = <LavoroProgetto p={trovato.p} committente={trovato.cm.nome} nonCensite={nonCensite} onScegli={scegli} barra={barra} />;
    destra = <SchedaProgetto p={trovato.p} committente={trovato.cm.nome} onNuovaIdea={() => setRichiesta({ tipo: "idea", progetto: trovato.p, padre: null })} />;
  } else if (trovato?.tipo === "committente") {
    centro = <LavoroCommittente cm={trovato.cm} onScegli={scegli} barra={barra} />;
    destra = <SchedaCommittente cm={trovato.cm} onNuovoProgetto={() => setRichiesta({ tipo: "progetto", committente: trovato.cm })}
      onRigenera={() => setRichiesta({ tipo: "rigenera", committente: trovato.cm })} />;
  }

  // Con il foglio aperto la pagina sotto il velo è inerte: il fuoco e i lettori di schermo restano nel foglio. Dialoghi e
  // avvisi stanno fuori, così un dialogo aperto dal foglio funziona.
  return (
    <>
      <div className="dashboard" {...(foglio ? { inert: "" } : {})}>
        <Indice committenti={albero ?? []} selezione={selezione} onScegli={scegli} vista={vista} onVista={setVista}
          posizione={tornatoSu ?? posizioneDi(trovato)} onPosizione={setTornatoSu} colonne={colonne} onColonne={cambiaColonne}
          ristretta={Boolean(ristretta)} onNuovoCommittente={() => setRichiesta({ tipo: "committente" })} aggiornato={aggiornato} release={release} errore={errore}
          onLingua={(l) => { salvaLingua(l); setLingua(l); }} />
        {centro}
        {!telefono && colonne.scheda && destra}
      </div>
      {foglio && <Foglio onChiudi={chiudiFoglio} esc={!richiesta}>{destra}</Foglio>}
      {richiesta && <Dialoghi r={richiesta} esecutori={esecutori} onChiudi={chiudi(richiesta)} />}
      {messaggio && (
        <div className="posto-toast">
          <Toast tono={messaggio.tono} titolo={messaggio.titolo} onChiudi={() => setMessaggio(null)}>{messaggio.testo}</Toast>
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("radice")!).render(<App />);
