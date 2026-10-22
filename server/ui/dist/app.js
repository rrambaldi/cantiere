// Ingresso della dashboard: dati, selezione, aggiornamento periodico e azioni.
import { api, committenteDellaPagina } from "./api.js";
import { Dialoghi } from "./dialoghi.js";
import { Toast } from "./ds/feedback.js";
import { VISTA_DI } from "./formato.js";
import { Indice, Percorso, posizioneDi, segmentiDi, trova } from "./indice.js";
import { LavoroCantiere, LavoroCommittente, LavoroProgetto } from "./lavori.js";
import { SchedaCantiere, SchedaCommittente, SchedaProgetto } from "./scheda.js";
import { impostaLingua, lingua as linguaCorrente, salvaLingua, T } from "./testi.js";
import { BottoneIcona, Vuoto } from "./ui.js";
const CHIAVE_SELEZIONE = "forgia-selezione";
const CHIAVE_COLONNE = "forgia-colonne";
const COLONNE_PREDEFINITE = { colonna: true, fissata: false, scheda: true };
const AGGIORNA_OGNI_MS = 30_000;
const FILE_AMMESSO = /\.(md|txt)$/i;
// Quel che il browser ricorda (scelta, colonne) è una comodità: senza storage si riparte dal valore predefinito.
function ricordato(chiave, predefinito) {
    try {
        return JSON.parse(localStorage.getItem(chiave) ?? "null") ?? predefinito;
    }
    catch {
        return predefinito;
    }
}
function ricorda(chiave, valore) {
    try {
        localStorage.setItem(chiave, JSON.stringify(valore));
    }
    catch {
        /* storage non disponibile: il valore non resta, il resto funziona */
    }
}
/** All'apertura: il primo cantiere in corso, altrimenti il primo progetto, altrimenti il primo committente. */
function predefinita(albero) {
    const progetti = albero.flatMap((cm) => cm.progetti);
    const aperto = progetti.flatMap((p) => p.cantieri).find((c) => c.stato === "aperto");
    if (aperto)
        return { tipo: "cantiere", id: aperto.id };
    if (progetti[0])
        return { tipo: "progetto", id: progetti[0].id };
    return albero[0] ? { tipo: "committente", id: albero[0].id } : null;
}
function App() {
    const ristretta = committenteDellaPagina();
    const [lingua, setLingua] = React.useState(linguaCorrente);
    impostaLingua(lingua); // prima dei figli, che leggono i testi correnti
    const [albero, setAlbero] = React.useState(null);
    const [errore, setErrore] = React.useState(null);
    const [aggiornato, setAggiornato] = React.useState(null);
    const [release, setRelease] = React.useState(null);
    const [selezione, setSelezione] = React.useState(() => ricordato(CHIAVE_SELEZIONE, null));
    const [vista, setVista] = React.useState("aperti");
    const [colonne, setColonne] = React.useState(() => ({ ...COLONNE_PREDEFINITE, ...ricordato(CHIAVE_COLONNE, {}) }));
    // «‹» nella colonna torna su senza cambiare la scelta; a ogni scelta nuova la colonna segue di nuovo la scelta.
    const [tornatoSu, setTornatoSu] = React.useState(null);
    const [dettaglio, setDettaglio] = React.useState(null);
    const [nonCensite, setNonCensite] = React.useState(null);
    const [richiesta, setRichiesta] = React.useState(null);
    const [messaggio, setMessaggio] = React.useState(null);
    const selezioneCorrente = React.useRef(selezione);
    selezioneCorrente.current = selezione;
    const caricaAlbero = React.useCallback(async () => {
        try {
            const r = await api.albero(ristretta);
            setAlbero(r.committenti);
            setRelease(r.release);
            setErrore(null);
            setAggiornato(new Date().toISOString());
        }
        catch (e) {
            setErrore(e.message);
        }
    }, [ristretta]);
    const caricaSelezione = React.useCallback(async (s) => {
        try {
            if (s?.tipo === "cantiere")
                setDettaglio(await api.cantiere(s.id));
            if (s?.tipo === "progetto")
                setNonCensite((await api.nonCensite(s.id)).sessioni);
        }
        catch (e) {
            setMessaggio({ titolo: T.datiNonCaricati, testo: e.message, tono: "errore" });
        }
    }, []);
    const aggiorna = React.useCallback(() => Promise.all([caricaAlbero(), caricaSelezione(selezioneCorrente.current)]), [caricaAlbero, caricaSelezione]);
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
    React.useEffect(() => ricorda(CHIAVE_COLONNE, colonne), [colonne]);
    const cambiaColonne = (c) => setColonne((v) => ({ ...v, ...c }));
    const trovato = albero ? trova(albero, selezione) : null;
    // Selezione sparita (o mai fatta): si sceglie quella predefinita.
    React.useEffect(() => {
        if (albero && !trovato)
            setSelezione(predefinita(albero));
    }, [albero, trovato]);
    React.useEffect(() => {
        if (!messaggio)
            return;
        const t = setTimeout(() => setMessaggio(null), messaggio.tono === "errore" ? 8000 : 4000);
        return () => clearTimeout(t);
    }, [messaggio]);
    const scegli = (s) => {
        if (albero && s.tipo === "cantiere") {
            const t = trova(albero, s);
            if (t?.tipo === "cantiere")
                setVista(VISTA_DI[t.c.stato]);
        }
        setSelezione(s);
    };
    // Un segmento del percorso sceglie quel livello e riapre la colonna lì.
    const daPercorso = (s) => {
        scegli(s);
        cambiaColonne({ colonna: true });
    };
    /** Carica i file uno per uno: uno rifiutato non ferma gli altri. */
    async function caricaFile(cantiere, file) {
        const errori = [];
        let caricati = 0;
        for (const f of file) {
            if (!FILE_AMMESSO.test(f.name)) {
                errori.push(T.soloMdTxt(f.name));
                continue;
            }
            try {
                await api.caricaFile(cantiere, f.name, await f.text());
                caricati++;
            }
            catch (e) {
                errori.push(`${f.name}: ${e.message}`);
            }
        }
        if (errori.length) {
            setMessaggio({ titolo: `${T.fileCaricati(caricati)}, ${T.fileRifiutati(errori.length)}`, testo: errori.join(" · "), tono: "errore" });
        }
        else if (caricati)
            setMessaggio({ titolo: T.fileCaricati(caricati) });
    }
    async function salvaFile(cantiere, nome, testo) {
        try {
            await api.caricaFile(cantiere, nome, testo);
        }
        catch (e) {
            setMessaggio({ titolo: T.modificaNonSalvata, testo: `${nome}: ${e.message}`, tono: "errore" });
            return false;
        }
        setMessaggio({ titolo: T.modificaSalvata, testo: nome });
        await aggiorna();
        return true;
    }
    const esecutori = {
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
            const testi = {
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
    const chiudi = (r) => () => setRichiesta((attuale) => (attuale === r ? null : attuale));
    const dettaglioDi = (c) => (dettaglio?.cantiere.id === c.id ? dettaglio : null);
    const barra = trovato && (React.createElement("div", { className: "barra-testata" },
        React.createElement(Percorso, { segmenti: segmentiDi(trovato), onScegli: daPercorso }),
        React.createElement(BottoneIcona, { icona: colonne.scheda ? "chiudiScheda" : "apriScheda", titolo: colonne.scheda ? T.chiudiScheda : T.apriScheda, onClick: () => cambiaColonne({ scheda: !colonne.scheda }) })));
    let centro = React.createElement("main", { className: "lavori" },
        React.createElement(Vuoto, null, albero ? T.scegliQualcosa : errore ?? T.caricamento));
    let destra = React.createElement("aside", { className: "scheda" });
    if (trovato?.tipo === "cantiere") {
        const d = dettaglioDi(trovato.c);
        if (d) {
            centro = React.createElement(LavoroCantiere, { d: d, barra: barra, onFile: (f) => void caricaFile(d.cantiere.id, f).then(aggiorna), onSalvaFile: (nome, testo) => salvaFile(d.cantiere.id, nome, testo), onTogliFile: (nome) => setRichiesta({ tipo: "togli", cantiere: d.cantiere, nome }) });
            destra = React.createElement(SchedaCantiere, { d: d, onEsito: (azione) => setRichiesta({ tipo: "esito", cantiere: d.cantiere, azione, discendenti: d.discendenti_attivi }), onModifica: () => setRichiesta({ tipo: "modifica", cantiere: d.cantiere }), onNuovaIdea: () => setRichiesta({ tipo: "idea", progetto: trovato.p, padre: d.cantiere }) });
        }
    }
    else if (trovato?.tipo === "progetto") {
        centro = React.createElement(LavoroProgetto, { p: trovato.p, committente: trovato.cm.nome, nonCensite: nonCensite, onScegli: scegli, barra: barra });
        destra = React.createElement(SchedaProgetto, { p: trovato.p, committente: trovato.cm.nome, onNuovaIdea: () => setRichiesta({ tipo: "idea", progetto: trovato.p, padre: null }) });
    }
    else if (trovato?.tipo === "committente") {
        centro = React.createElement(LavoroCommittente, { cm: trovato.cm, onScegli: scegli, barra: barra });
        destra = React.createElement(SchedaCommittente, { cm: trovato.cm, onNuovoProgetto: () => setRichiesta({ tipo: "progetto", committente: trovato.cm }), onRigenera: () => setRichiesta({ tipo: "rigenera", committente: trovato.cm }) });
    }
    return (React.createElement("div", { className: "dashboard" },
        React.createElement(Indice, { committenti: albero ?? [], selezione: selezione, onScegli: scegli, vista: vista, onVista: setVista, posizione: tornatoSu ?? posizioneDi(trovato), onPosizione: setTornatoSu, colonne: colonne, onColonne: cambiaColonne, ristretta: Boolean(ristretta), onNuovoCommittente: () => setRichiesta({ tipo: "committente" }), aggiornato: aggiornato, release: release, errore: errore, onLingua: (l) => { salvaLingua(l); setLingua(l); } }),
        centro,
        colonne.scheda && destra,
        richiesta && React.createElement(Dialoghi, { r: richiesta, esecutori: esecutori, onChiudi: chiudi(richiesta) }),
        messaggio && (React.createElement("div", { className: "posto-toast" },
            React.createElement(Toast, { tono: messaggio.tono, titolo: messaggio.titolo, onChiudi: () => setMessaggio(null) }, messaggio.testo)))));
}
ReactDOM.createRoot(document.getElementById("radice")).render(React.createElement(App, null));
