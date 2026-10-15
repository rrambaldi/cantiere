import { Logo } from "./ds/brand.js";
import { Button, Tabs } from "./ds/core.js";
import { StatoBadge } from "./ds/feedback.js";
import { ora, profondita, VISTA_DI } from "./formato.js";
import { Vuoto } from "./ui.js";
const stessa = (a, b) => a?.tipo === b.tipo && a.id === b.id;
/** Ordine per segmenti, così i figli seguono subito il padre (`a/b` dopo `a`, prima di `a-x`). */
function perPercorso(a, b) {
    const x = a.percorso.split("/");
    const y = b.percorso.split("/");
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
        const c = x[i].localeCompare(y[i], "it");
        if (c)
            return c;
    }
    return x.length - y.length;
}
function Voce({ attiva, rientro = 0, onClick, children, titolo }) {
    return (React.createElement("button", { className: "voce" + (attiva ? " attiva" : ""), style: { paddingLeft: 16 + rientro * 14 }, onClick: onClick, title: titolo, "aria-current": attiva || undefined }, children));
}
export function Indice({ committenti, selezione, onScegli, vista, onVista, ristretta, onNuovoCommittente, aggiornato, errore }) {
    const tutti = committenti.flatMap((c) => c.progetti.flatMap((p) => p.cantieri));
    const conta = (v) => tutti.filter((c) => VISTA_DI[c.stato] === v).length;
    return (React.createElement("aside", { className: "indice", "aria-label": "Indice" },
        React.createElement("div", { className: "indice-testa" },
            React.createElement(Logo, { size: 22, wordmark: true }),
            ristretta && committenti[0] && React.createElement("span", { className: "committente-ristretto" }, committenti[0].nome)),
        React.createElement("div", { style: { padding: "0 16px" } },
            React.createElement(Tabs, { value: vista, onChange: onVista, items: [
                    { id: "aperti", label: "Aperti", count: conta("aperti") },
                    { id: "idee", label: "Idee", count: conta("idee") },
                    { id: "chiusi", label: "Chiusi", count: conta("chiusi") },
                ] })),
        React.createElement("nav", { className: "albero" },
            committenti.length === 0 && React.createElement(Vuoto, null,
                "Nessun committente. ",
                ristretta ? "" : "Crea il primo con «Nuovo committente»."),
            committenti.map((cm) => (React.createElement("div", { key: cm.id, className: "gruppo" },
                React.createElement(Voce, { attiva: stessa(selezione, { tipo: "committente", id: cm.id }), onClick: () => onScegli({ tipo: "committente", id: cm.id }) },
                    React.createElement("span", { className: "nome-committente" }, cm.nome)),
                cm.progetti.map((p) => {
                    const visibili = p.cantieri.filter((c) => VISTA_DI[c.stato] === vista).sort(perPercorso);
                    const ids = new Set(visibili.map((c) => c.id));
                    return (React.createElement("div", { key: p.id },
                        React.createElement(Voce, { rientro: 0.5, attiva: stessa(selezione, { tipo: "progetto", id: p.id }), onClick: () => onScegli({ tipo: "progetto", id: p.id }) },
                            React.createElement("span", { className: "nome-progetto" }, p.nome),
                            p.non_censite > 0 && React.createElement("span", { className: "a-destra", title: "attivit\u00E0 non censite" },
                                p.non_censite,
                                " non censite")),
                        visibili.map((c) => {
                            // Un figlio il cui padre sta in un'altra scheda mostra il percorso intero.
                            const orfano = c.padre_id != null && !ids.has(c.padre_id);
                            return (React.createElement(Voce, { key: c.id, rientro: 1.5 + (orfano ? 0 : profondita(c)), titolo: c.percorso, attiva: stessa(selezione, { tipo: "cantiere", id: c.id }), onClick: () => onScegli({ tipo: "cantiere", id: c.id }) },
                                React.createElement(StatoBadge, { stato: c.stato, etichetta: false }),
                                React.createElement("span", { className: "nome-cantiere" }, orfano ? c.percorso : c.nome),
                                c.sessioni.length > 0 && React.createElement("span", { className: "a-destra", title: "sessioni attive" }, c.sessioni.length)));
                        })));
                }))))),
        React.createElement("div", { className: "indice-piede" },
            !ristretta && React.createElement(Button, { variant: "secondario", size: "sm", onClick: onNuovoCommittente, style: { width: "100%" } }, "Nuovo committente"),
            React.createElement("span", { className: "connessione" + (errore ? " errore" : "") }, errore ?? (aggiornato ? `aggiornato ${ora(aggiornato)}` : "caricamento")))));
}
