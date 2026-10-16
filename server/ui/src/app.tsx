// Ingresso della dashboard: dati, selezione, aggiornamento periodico e azioni.
import { api, committenteDellaPagina, type Azione, type Cantiere, type Committente, type Dettaglio, type NonCensita, type Progetto } from "./api.ts";
import { Dialoghi, type Esecutori, type Richiesta } from "./dialoghi.tsx";
import { Toast } from "./ds/feedback.tsx";
import { VISTA_DI, type Vista } from "./formato.ts";
import { Indice, type Selezione } from "./indice.tsx";
import { LavoroCantiere, LavoroCommittente, LavoroProgetto } from "./lavori.tsx";
import { SchedaCantiere, SchedaCommittente, SchedaProgetto } from "./scheda.tsx";
import { impostaLingua, lingua as linguaCorrente, salvaLingua, T, type Lingua } from "./testi.ts";
import { Vuoto } from "./ui.tsx";

const CHIAVE_SELEZIONE = "forgia-selezione";
const AGGIORNA_OGNI_MS = 30_000;
const FILE_AMMESSO = /\.(md|txt)$/i;

// La selezione ricordata è una comodità: se il browser non dà lo storage, si riparte senza.
function selezioneSalvata(): Selezione | null {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE_SELEZIONE) ?? "null");
  } catch {
    return null;
  }
}
function salvaSelezione(s: Selezione | null) {
  try {
    localStorage.setItem(CHIAVE_SELEZIONE, JSON.stringify(s));
  } catch {
    /* storage non disponibile: la selezione non resta, il resto funziona */
  }
}

type Trovato =
  | { tipo: "committente"; cm: Committente }
  | { tipo: "progetto"; cm: Committente; p: Progetto }
  | { tipo: "cantiere"; cm: Committente; p: Progetto; c: Cantiere };

function trova(albero: Committente[], s: Selezione | null): Trovato | null {
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
  const [selezione, setSelezione] = React.useState<Selezione | null>(selezioneSalvata);
  const [vista, setVista] = React.useState<Vista>("aperti");
  const [dettaglio, setDettaglio] = React.useState<Dettaglio | null>(null);
  const [nonCensite, setNonCensite] = React.useState<NonCensita[] | null>(null);
  const [richiesta, setRichiesta] = React.useState<Richiesta | null>(null);
  const [messaggio, setMessaggio] = React.useState<Messaggio | null>(null);
  const selezioneCorrente = React.useRef(selezione);
  selezioneCorrente.current = selezione;

  const caricaAlbero = React.useCallback(async () => {
    try {
      const r = await api.albero(ristretta);
      setAlbero(r.committenti);
      setErrore(null);
      setAggiornato(new Date().toISOString());
    } catch (e) {
      setErrore((e as Error).message);
    }
  }, [ristretta]);

  const caricaSelezione = React.useCallback(async (s: Selezione | null) => {
    try {
      if (s?.tipo === "cantiere") setDettaglio(await api.cantiere(s.id));
      if (s?.tipo === "progetto") setNonCensite((await api.nonCensite(s.id)).sessioni);
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
    salvaSelezione(selezione);
    setNonCensite(null);
    void caricaSelezione(selezione);
  }, [selezione, caricaSelezione]);

  const trovato = albero ? trova(albero, selezione) : null;
  // Selezione sparita (o mai fatta): si sceglie quella predefinita.
  React.useEffect(() => {
    if (albero && !trovato) setSelezione(predefinita(albero));
  }, [albero, trovato]);

  React.useEffect(() => {
    if (!messaggio) return;
    const t = setTimeout(() => setMessaggio(null), messaggio.tono === "errore" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [messaggio]);

  const scegli = (s: Selezione) => {
    if (albero && s.tipo === "cantiere") {
      const t = trova(albero, s);
      if (t?.tipo === "cantiere") setVista(VISTA_DI[t.c.stato]);
    }
    setSelezione(s);
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

  let centro: React.ReactNode = <main className="lavori"><Vuoto>{albero ? T.scegliQualcosa : errore ?? T.caricamento}</Vuoto></main>;
  let destra: React.ReactNode = <aside className="scheda" />;
  if (trovato?.tipo === "cantiere") {
    const d = dettaglioDi(trovato.c);
    if (d) {
      centro = <LavoroCantiere d={d} onFile={(f) => void caricaFile(d.cantiere.id, f).then(aggiorna)}
        onTogliFile={(nome) => setRichiesta({ tipo: "togli", cantiere: d.cantiere, nome })} />;
      destra = <SchedaCantiere d={d}
        onEsito={(azione) => setRichiesta({ tipo: "esito", cantiere: d.cantiere, azione, discendenti: d.discendenti_attivi })}
        onModifica={() => setRichiesta({ tipo: "modifica", cantiere: d.cantiere })}
        onNuovaIdea={() => setRichiesta({ tipo: "idea", progetto: trovato.p, padre: d.cantiere })} />;
    }
  } else if (trovato?.tipo === "progetto") {
    centro = <LavoroProgetto p={trovato.p} committente={trovato.cm.nome} nonCensite={nonCensite} onScegli={scegli} />;
    destra = <SchedaProgetto p={trovato.p} committente={trovato.cm.nome} onNuovaIdea={() => setRichiesta({ tipo: "idea", progetto: trovato.p, padre: null })} />;
  } else if (trovato?.tipo === "committente") {
    centro = <LavoroCommittente cm={trovato.cm} onScegli={scegli} />;
    destra = <SchedaCommittente cm={trovato.cm} onNuovoProgetto={() => setRichiesta({ tipo: "progetto", committente: trovato.cm })}
      onRigenera={() => setRichiesta({ tipo: "rigenera", committente: trovato.cm })} />;
  }

  return (
    <div className="dashboard">
      <Indice committenti={albero ?? []} selezione={selezione} onScegli={scegli} vista={vista} onVista={setVista}
        ristretta={Boolean(ristretta)} onNuovoCommittente={() => setRichiesta({ tipo: "committente" })} aggiornato={aggiornato} errore={errore}
        onLingua={(l) => { salvaLingua(l); setLingua(l); }} />
      {centro}
      {destra}
      {richiesta && <Dialoghi r={richiesta} esecutori={esecutori} onChiudi={chiudi(richiesta)} />}
      {messaggio && (
        <div className="posto-toast">
          <Toast tono={messaggio.tono} titolo={messaggio.titolo} onChiudi={() => setMessaggio(null)}>{messaggio.testo}</Toast>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("radice")!).render(<App />);
