import { Logo } from "./ds/brand.js";
import { Button, Tabs } from "./ds/core.js";
import { StatoBadge } from "./ds/feedback.js";
import { ora, profondita, VISTA_DI } from "./formato.js";
import { lingua, NOMI_LINGUA, T } from "./testi.js";
import { BottoneIcona, Etichetta, Icona, Pallino, Vuoto } from "./ui.js";
export function trova(albero, s) {
    if (!s)
        return null;
    for (const cm of albero) {
        if (s.tipo === "committente" && cm.id === s.id)
            return { tipo: "committente", cm };
        for (const p of cm.progetti) {
            if (s.tipo === "progetto" && p.id === s.id)
                return { tipo: "progetto", cm, p };
            const c = s.tipo === "cantiere" ? p.cantieri.find((x) => x.id === s.id) : undefined;
            if (c)
                return { tipo: "cantiere", cm, p, c };
        }
    }
    return null;
}
/** Dove sta la colonna per una scelta: sui progetti del committente scelto, o sui cantieri del progetto. */
export function posizioneDi(t) {
    if (!t)
        return { livello: "committenti" };
    return t.tipo === "committente" ? { livello: "progetti", cm: t.cm.id } : { livello: "cantieri", cm: t.cm.id, p: t.p.id };
}
/** Committente, progetto, i padri del cantiere e il cantiere: tutti cliccabili tranne l'ultimo. */
export function segmentiDi(t) {
    const scelta = (tipo, id) => ({ tipo, id });
    if (t.tipo === "committente")
        return [{ testo: t.cm.nome }];
    const su = [{ testo: t.cm.nome, scelta: scelta("committente", t.cm.id) }];
    if (t.tipo === "progetto")
        return [...su, { testo: t.p.nome }];
    const padri = [];
    for (let x = t.p.cantieri.find((y) => y.id === t.c.padre_id); x; x = t.p.cantieri.find((y) => y.id === x.padre_id)) {
        padri.unshift({ testo: x.nome, scelta: scelta("cantiere", x.id) });
    }
    return [...su, { testo: t.p.nome, scelta: scelta("progetto", t.p.id) }, ...padri, { testo: t.c.nome }];
}
/** L'indirizzo di una scelta: `#/committente/progetto/padre/cantiere`, un nome per segmento (i nomi non hanno `/`). */
export function hashDi(t) {
    const nomi = [t.cm.nome, ...(t.tipo === "committente" ? [] : [t.p.nome]), ...(t.tipo === "cantiere" ? t.c.percorso.split("/") : [])];
    return "#/" + nomi.map(encodeURIComponent).join("/");
}
/** La scelta scritta in un indirizzo, se c'è ancora nell'albero. */
export function selezioneDaHash(albero, hash) {
    let nomi;
    try {
        nomi = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    }
    catch {
        return null; // codifica rotta (`%E0`): vale come un indirizzo senza scelta
    }
    const cm = albero.find((x) => x.nome === nomi[0]);
    if (!cm)
        return null;
    if (nomi.length === 1)
        return { tipo: "committente", id: cm.id };
    const p = cm.progetti.find((x) => x.nome === nomi[1]);
    if (!p)
        return null;
    if (nomi.length === 2)
        return { tipo: "progetto", id: p.id };
    const c = p.cantieri.find((x) => x.percorso === nomi.slice(2).join("/"));
    return c ? { tipo: "cantiere", id: c.id } : null;
}
const PROFONDITA = { committenti: 0, progetti: 1, cantieri: 2 };
export const stessa = (a, b) => a?.tipo === b.tipo && a.id === b.id;
const domandeDi = (cm) => cm.progetti.reduce((n, p) => n + p.domande_in_attesa, 0);
/** Ordine per segmenti, così i figli seguono subito il padre (`a/b` dopo `a`, prima di `a-x`). */
function perPercorso(a, b) {
    const x = a.percorso.split("/");
    const y = b.percorso.split("/");
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
        const c = x[i].localeCompare(y[i], lingua);
        if (c)
            return c;
    }
    return x.length - y.length;
}
/** Dalla pagina di un committente alla home: URL relativo, così regge il prefisso del proxy. */
const tornaAllaHome = () => window.location.assign("./");
function Voce({ attiva, rientro = 0, onClick, children, titolo }) {
    return (React.createElement("button", { className: "voce" + (attiva ? " attiva" : ""), style: { paddingLeft: 16 + rientro * 14 }, onClick: onClick, title: titolo, "aria-current": attiva || undefined }, children));
}
const Freccia = () => React.createElement("span", { className: "freccia" },
    React.createElement(Icona, { nome: "avanti" }));
/**
 * Testa del livello: «‹» con il pallino delle domande rimaste fuori da questo livello, etichetta, titolo con quello delle
 * domande che le righe sotto non mostrano, e conteggio.
 */
function TestaLivello({ indietro, etichetta, titolo, domande = 0, n, rif, doppioClic }) {
    return (React.createElement("div", { className: "livello-testa" },
        indietro && (React.createElement("button", { className: "indietro", onClick: indietro.onClick, title: indietro.titolo, "aria-label": indietro.titolo },
            React.createElement(Icona, { nome: "indietro" }),
            indietro.testo,
            React.createElement(Pallino, { n: indietro.domande }))),
        etichetta && React.createElement(Etichetta, null, etichetta),
        React.createElement("h2", { ref: rif, tabIndex: -1, className: "livello-titolo", title: doppioClic?.titolo, onDoubleClick: doppioClic?.onDoubleClick },
            titolo,
            React.createElement(Pallino, { n: domande }),
            React.createElement("span", { className: "conta" }, n))));
}
export function Indice({ committenti, selezione, onScegli, posizione, onPosizione, vista, onVista, colonne, onColonne, ristretta, onNuovoCommittente, aggiornato, release, errore, onLingua }) {
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
    const fuoco = React.useRef(null);
    const titolo = React.useRef(null);
    const sfoglia = React.useRef(null);
    const aperta = React.useRef(colonne.colonna);
    React.useEffect(() => {
        // Aperta da fuori (un segmento del percorso, che al telefono la colonna copre), prende il fuoco rimasto nel vuoto.
        if (colonne.colonna && !aperta.current && document.activeElement === document.body)
            fuoco.current = "titolo";
        aperta.current = colonne.colonna;
        const el = fuoco.current === "titolo" ? titolo.current : fuoco.current === "sfoglia" ? sfoglia.current : null;
        if (!el)
            return;
        el.focus();
        fuoco.current = null;
    }, [chiave, colonne.colonna]);
    const scendi = (s) => { fuoco.current = "titolo"; onScegli(s); };
    const sali = (p) => { fuoco.current = "titolo"; onPosizione(p); };
    const chiudi = () => { fuoco.current = "sfoglia"; onColonne({ colonna: false }); };
    const domande = committenti.reduce((n, x) => n + domandeDi(x), 0);
    const testoStato = errore ?? (release ? T.release(release) : T.caricamentoMin);
    const stato = (React.createElement("span", { className: "connessione" + (errore ? " errore" : ""), title: aggiornato ? T.aggiornatoAlle(ora(aggiornato)) : testoStato }, testoStato));
    const logo = (React.createElement("span", { onDoubleClick: ristretta ? tornaAllaHome : undefined, title: ristretta ? T.tornaAllaHome : undefined },
        React.createElement(Logo, { size: 22, wordmark: colonne.colonna })));
    if (!colonne.colonna) {
        return (React.createElement("aside", { className: "indice rotaia", "aria-label": T.indice },
            logo,
            React.createElement("button", { ref: sfoglia, className: "sfoglia", onClick: () => { fuoco.current = "titolo"; onColonne({ colonna: true }); }, title: T.apriColonna, "aria-label": T.apriColonna },
                React.createElement(Icona, { nome: "apriColonna" }),
                React.createElement("span", { className: "verticale", "aria-hidden": "true" }, T.sfoglia)),
            React.createElement(Pallino, { n: domande }),
            stato));
    }
    const scegliCantiere = (c) => {
        onScegli({ tipo: "cantiere", id: c.id });
        chiudi();
    };
    let contenuto;
    if (p && cm) {
        // Il pallino conta le domande proprie dei cantieri del filtro: con quelle dei figli, un padre aperto conterebbe un figlio chiuso.
        // Quelle delle sessioni senza cantiere vanno sul titolo.
        const proprie = (cs) => cs.reduce((n, c) => n + c.domande.length, 0);
        const filtro = (id, testo) => {
            const dentro = p.cantieri.filter((c) => VISTA_DI[c.stato] === id);
            return { id, label: React.createElement(React.Fragment, null,
                    testo,
                    React.createElement(Pallino, { n: proprie(dentro) })), count: dentro.length };
        };
        const visibili = p.cantieri.filter((c) => VISTA_DI[c.stato] === vista).sort(perPercorso);
        const ids = new Set(visibili.map((c) => c.id));
        contenuto = (React.createElement(React.Fragment, null,
            React.createElement(TestaLivello, { rif: titolo, etichetta: T.cantieriDi, titolo: p.nome, domande: p.domande_in_attesa - proprie(p.cantieri), n: p.cantieri.length, indietro: { testo: cm.nome, titolo: T.tornaAProgettiDi(cm.nome), domande: domande - p.domande_in_attesa, onClick: () => sali({ livello: "progetti", cm: cm.id }) } }),
            React.createElement("div", { className: "filtri-livello" },
                React.createElement(Tabs, { value: vista, onChange: onVista, items: [filtro("aperti", T.aperti), filtro("idee", T.idee), filtro("chiusi", T.chiusi)] })),
            React.createElement("nav", { className: "lista-livello", "aria-label": T.cantieriDi + " " + p.nome },
                visibili.length === 0 && React.createElement(Vuoto, null, T.nessunoInVista[vista]),
                visibili.map((c) => {
                    // Un figlio il cui padre sta in un altro filtro mostra il percorso intero.
                    const orfano = c.padre_id != null && !ids.has(c.padre_id);
                    return (React.createElement(Voce, { key: c.id, rientro: orfano ? 0 : profondita(c), titolo: c.percorso, attiva: stessa(selezione, { tipo: "cantiere", id: c.id }), onClick: () => scegliCantiere(c) },
                        React.createElement(StatoBadge, { stato: c.stato, etichetta: false }),
                        React.createElement("span", { className: "nome-cantiere" }, orfano ? c.percorso : c.nome),
                        React.createElement(Pallino, { n: c.domande_in_attesa }),
                        c.task && React.createElement("span", { className: "a-destra" },
                            c.task.fatti,
                            "/",
                            c.task.totali),
                        c.sessioni.length > 0 && React.createElement("span", { className: "a-destra", title: T.sessioniAttive }, c.sessioni.length)));
                }))));
    }
    else if (cm) {
        // Il doppio clic per la pagina del committente sta sul titolo: la riga del committente sparisce al primo clic.
        contenuto = (React.createElement(React.Fragment, null,
            React.createElement(TestaLivello, { rif: titolo, etichetta: T.progettiDi, titolo: cm.nome, n: cm.progetti.length, indietro: { testo: T.committenti, titolo: T.tornaACommittenti, domande: domande - domandeDi(cm), onClick: () => sali({ livello: "committenti" }) }, doppioClic: ristretta ? { titolo: T.tornaAllaHome, onDoubleClick: tornaAllaHome }
                    : { titolo: T.paginaCommittente, onDoubleClick: () => window.location.assign(encodeURIComponent(cm.nome)) } }),
            React.createElement("nav", { className: "lista-livello", "aria-label": T.progettiDi + " " + cm.nome },
                cm.progetti.length === 0 && React.createElement(Vuoto, null, T.nessunProgetto),
                cm.progetti.map((x) => (React.createElement(Voce, { key: x.id, attiva: stessa(selezione, { tipo: "progetto", id: x.id }), onClick: () => scendi({ tipo: "progetto", id: x.id }) },
                    React.createElement("span", { className: "nome-progetto" }, x.nome),
                    React.createElement(Pallino, { n: x.domande_in_attesa }),
                    x.non_censite > 0 && React.createElement("span", { className: "a-destra", title: T.attivitaNonCensite }, T.nonCensiteN(x.non_censite)),
                    React.createElement("span", { className: "a-destra", title: T.aperti }, x.cantieri.filter((c) => VISTA_DI[c.stato] === "aperti").length),
                    React.createElement(Freccia, null)))))));
    }
    else {
        contenuto = (React.createElement(React.Fragment, null,
            React.createElement(TestaLivello, { rif: titolo, titolo: T.committenti, n: committenti.length }),
            React.createElement("nav", { className: "lista-livello", "aria-label": T.committenti },
                committenti.length === 0 && React.createElement(Vuoto, null,
                    T.nessunCommittente,
                    " ",
                    ristretta ? "" : T.creaPrimoCommittente),
                committenti.map((x) => (React.createElement(Voce, { key: x.id, attiva: stessa(selezione, { tipo: "committente", id: x.id }), onClick: () => scendi({ tipo: "committente", id: x.id }) },
                    React.createElement("span", { className: "nome-committente" }, x.nome),
                    React.createElement(Pallino, { n: domandeDi(x) }),
                    React.createElement("span", { className: "a-destra" }, x.progetti.length),
                    React.createElement(Freccia, null)))))));
    }
    return (React.createElement("aside", { className: "indice", "aria-label": T.indice },
        React.createElement("div", { className: "indice-testa" },
            logo,
            React.createElement("label", { className: "lingua", title: T.lingua },
                React.createElement(Icona, { nome: "lingua" }),
                React.createElement("select", { "aria-label": T.lingua, value: lingua, onChange: (e) => onLingua(e.target.value) }, Object.entries(NOMI_LINGUA).map(([l, nome]) => React.createElement("option", { key: l, value: l }, nome)))),
            React.createElement(BottoneIcona, { icona: "chiudiColonna", titolo: T.chiudiColonna, onClick: chiudi })),
        React.createElement("section", { key: chiave, className: "livello" + (entrata.current.daSinistra ? " da-sinistra" : "") }, contenuto),
        React.createElement("div", { className: "indice-piede" },
            !ristretta && React.createElement(Button, { variant: "secondario", size: "sm", onClick: onNuovoCommittente, style: { width: "100%" } }, T.nuovoCommittente),
            stato)));
}
// Un segmento cliccato fa cambiare pagina al centro, e il percorso rinasce: il fuoco va al segmento corrente nuovo.
let fuocoAlPercorso = false;
/** Il percorso sopra il titolo del centro: ogni segmento tranne l'ultimo sceglie quel livello. */
export function Percorso({ segmenti, onScegli }) {
    const corrente = React.useRef(null);
    const ultimo = segmenti[segmenti.length - 1]?.testo;
    React.useEffect(() => {
        if (!fuocoAlPercorso)
            return;
        fuocoAlPercorso = false;
        corrente.current?.focus();
    }, [ultimo]);
    return (React.createElement("nav", { className: "percorso", "aria-label": T.percorso },
        React.createElement("ol", null, segmenti.map((s, i) => (React.createElement("li", { key: i },
            s.scelta
                ? React.createElement("button", { onClick: () => { fuocoAlPercorso = true; onScegli(s.scelta); } }, s.testo)
                : React.createElement("span", { ref: corrente, tabIndex: -1, "aria-current": "page" }, s.testo),
            i < segmenti.length - 1 && React.createElement("span", { className: "sep", "aria-hidden": "true" }, "/")))))));
}
