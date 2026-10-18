import { Logo } from "./ds/brand.js";
import { Button, Tabs } from "./ds/core.js";
import { StatoBadge } from "./ds/feedback.js";
import { ora, profondita, VISTA_DI } from "./formato.js";
import { lingua, T } from "./testi.js";
import { Pallino, Vuoto } from "./ui.js";
const stessa = (a, b) => a?.tipo === b.tipo && a.id === b.id;
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
const CHIAVE_CHIUSI = "forgia-committenti-chiusi";
function chiusiSalvati() {
    try {
        const salvati = JSON.parse(localStorage.getItem(CHIAVE_CHIUSI) ?? "[]");
        return Array.isArray(salvati) ? salvati.filter((x) => typeof x === "number") : [];
    }
    catch {
        return [];
    }
}
function Voce({ attiva, rientro = 0, onClick, onDoppioClick, children, titolo }) {
    return (React.createElement("button", { className: "voce" + (attiva ? " attiva" : ""), style: { paddingLeft: 16 + rientro * 14 }, onClick: onClick, onDoubleClick: onDoppioClick, title: titolo, "aria-current": attiva || undefined }, children));
}
export function Indice({ committenti, selezione, onScegli, vista, onVista, ristretta, onNuovoCommittente, aggiornato, release, errore, onLingua }) {
    const [chiusi, setChiusi] = React.useState(chiusiSalvati);
    const alterna = (id) => setChiusi((c) => {
        const nuovi = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
        try {
            localStorage.setItem(CHIAVE_CHIUSI, JSON.stringify(nuovi));
        }
        catch {
            // niente archivio del browser: la scelta vale fino al ricaricamento
        }
        return nuovi;
    });
    const tutti = committenti.flatMap((c) => c.progetti.flatMap((p) => p.cantieri));
    const conta = (v) => tutti.filter((c) => VISTA_DI[c.stato] === v).length;
    return (React.createElement("aside", { className: "indice", "aria-label": T.indice },
        React.createElement("div", { className: "indice-testa" },
            React.createElement(Logo, { size: 22, wordmark: true }),
            ristretta && committenti[0] && React.createElement("span", { className: "committente-ristretto" }, committenti[0].nome),
            React.createElement("span", { role: "group", "aria-label": T.lingua, style: { marginLeft: "auto", display: "inline-flex", gap: 2 } }, ["it", "en"].map((l) => (React.createElement(Button, { key: l, variant: l === lingua ? "secondario" : "fantasma", size: "sm", onClick: () => onLingua(l) }, l.toUpperCase()))))),
        React.createElement("div", { style: { padding: "0 16px" } },
            React.createElement(Tabs, { value: vista, onChange: onVista, items: [
                    { id: "aperti", label: T.aperti, count: conta("aperti") },
                    { id: "idee", label: T.idee, count: conta("idee") },
                    { id: "chiusi", label: T.chiusi, count: conta("chiusi") },
                ] })),
        React.createElement("nav", { className: "albero" },
            committenti.length === 0 && React.createElement(Vuoto, null,
                T.nessunCommittente,
                " ",
                ristretta ? "" : T.creaPrimoCommittente),
            committenti.map((cm) => (React.createElement("div", { key: cm.id, className: "gruppo" },
                React.createElement("div", { className: "riga-committente" },
                    React.createElement("button", { className: "chevron", onClick: () => alterna(cm.id), "aria-expanded": !chiusi.includes(cm.id), "aria-label": chiusi.includes(cm.id) ? T.apriGruppo(cm.nome) : T.chiudiGruppo(cm.nome) },
                        React.createElement("span", { "aria-hidden": "true" }, chiusi.includes(cm.id) ? "▸" : "▾")),
                    React.createElement(Voce, { attiva: stessa(selezione, { tipo: "committente", id: cm.id }), onClick: () => onScegli({ tipo: "committente", id: cm.id }), onDoppioClick: ristretta ? undefined : () => window.location.assign(encodeURIComponent(cm.nome)), titolo: ristretta ? undefined : T.paginaCommittente },
                        React.createElement("span", { className: "nome-committente" }, cm.nome),
                        React.createElement(Pallino, { n: cm.progetti.reduce((n, p) => n + p.domande_in_attesa, 0) }))),
                !chiusi.includes(cm.id) && cm.progetti.map((p) => {
                    const visibili = p.cantieri.filter((c) => VISTA_DI[c.stato] === vista).sort(perPercorso);
                    const ids = new Set(visibili.map((c) => c.id));
                    return (React.createElement("div", { key: p.id },
                        React.createElement(Voce, { rientro: 0.5, attiva: stessa(selezione, { tipo: "progetto", id: p.id }), onClick: () => onScegli({ tipo: "progetto", id: p.id }) },
                            React.createElement("span", { className: "nome-progetto" }, p.nome),
                            React.createElement(Pallino, { n: p.domande_in_attesa }),
                            p.non_censite > 0 && React.createElement("span", { className: "a-destra", title: T.attivitaNonCensite }, T.nonCensiteN(p.non_censite))),
                        visibili.map((c) => {
                            // Un figlio il cui padre sta in un'altra scheda mostra il percorso intero.
                            const orfano = c.padre_id != null && !ids.has(c.padre_id);
                            return (React.createElement(Voce, { key: c.id, rientro: 1.5 + (orfano ? 0 : profondita(c)), titolo: c.percorso, attiva: stessa(selezione, { tipo: "cantiere", id: c.id }), onClick: () => onScegli({ tipo: "cantiere", id: c.id }) },
                                React.createElement(StatoBadge, { stato: c.stato, etichetta: false }),
                                React.createElement("span", { className: "nome-cantiere" }, orfano ? c.percorso : c.nome),
                                React.createElement(Pallino, { n: c.domande_in_attesa }),
                                c.sessioni.length > 0 && React.createElement("span", { className: "a-destra", title: T.sessioniAttive }, c.sessioni.length)));
                        })));
                }))))),
        React.createElement("div", { className: "indice-piede" },
            !ristretta && React.createElement(Button, { variant: "secondario", size: "sm", onClick: onNuovoCommittente, style: { width: "100%" } }, T.nuovoCommittente),
            React.createElement("span", { className: "connessione" + (errore ? " errore" : ""), title: aggiornato ? T.aggiornatoAlle(ora(aggiornato)) : undefined }, errore ?? (release ? T.release(release) : T.caricamentoMin)))));
}
