import { Button, Checkbox } from "./ds/core.js";
import { StatoBadge } from "./ds/feedback.js";
import { eta, finale, giorno, quando } from "./formato.js";
import { Avanzamento, Campi, Etichetta, Vuoto } from "./ui.js";
const ARTEFATTI = ["proposal", "design", "specs", "tasks"];
function Blocco({ titolo, children }) {
    return React.createElement("div", { className: "blocco" },
        React.createElement(Etichetta, null, titolo),
        children);
}
export function SchedaCantiere({ d, onEsito, onModifica, onNuovaIdea }) {
    const c = d.cantiere;
    return (React.createElement("aside", { className: "scheda", "aria-label": "Scheda tecnica" },
        React.createElement(Blocco, { titolo: "scheda tecnica" }, React.createElement(Campi, { righe: [
                ["progetto", c.progetto],
                ["change", React.createElement("code", null, c.change)],
                ["stato", React.createElement(StatoBadge, { stato: c.stato })],
                ["origine", c.origine],
                ["creato", quando(c.creato_il)],
                ["aggiornato", quando(c.aggiornato_il)],
            ] })),
        c.stato !== "idea" && (React.createElement(Blocco, { titolo: "avanzamento" },
            c.task ? React.createElement(Campi, { righe: [["task", React.createElement(Avanzamento, { fatti: c.task.fatti, totali: c.task.totali, attivo: c.stato === "aperto" })]] })
                : React.createElement(Vuoto, null, "Nessun tasks.md nella copia del change."),
            c.fasi && React.createElement(Campi, { righe: [["fasi", React.createElement(Avanzamento, { fatti: c.fasi.completate, totali: c.fasi.totali, attivo: c.stato === "aperto" })]] }),
            c.artefatti && (React.createElement("ul", { className: "artefatti" }, ARTEFATTI.map((a) => React.createElement("li", { key: a, className: c.artefatti[a] ? "c-e" : "" },
                c.artefatti[a] ? "✓" : "—",
                " ",
                a)))))),
        c.sessioni.length > 0 && (React.createElement(Blocco, { titolo: "sessioni attive" },
            React.createElement("ul", { className: "sessioni" }, c.sessioni.map((s) => (React.createElement("li", { key: s.session_id },
                React.createElement("span", null,
                    s.host,
                    s.branch ? ` · ${s.branch}` : ""),
                React.createElement("span", { className: "secondario" },
                    s.titolo ?? s.stato,
                    " \u00B7 ",
                    eta(s.eta_secondi)))))))),
        d.todo.length > 0 && (React.createElement(Blocco, { titolo: "todo delle sessioni" }, d.todo.map((t, i) => (React.createElement(Checkbox, { key: i, checked: t.stato === "completed", label: React.createElement("span", { style: { color: t.stato === "completed" ? "var(--testo-2)" : "var(--testo)" } },
                t.testo,
                t.stato === "in_progress" ? " · in corso" : "") }))))),
        d.esiti.length > 0 && (React.createElement(Blocco, { titolo: "storico" },
            React.createElement("ul", { className: "storico" }, d.esiti.map((e, i) => React.createElement("li", { key: i },
                React.createElement(StatoBadge, { stato: e.stato }),
                " ",
                React.createElement("span", { className: "secondario" },
                    giorno(e.ts),
                    " \u00B7 ",
                    e.da)))))),
        React.createElement("div", { className: "blocco azioni" },
            React.createElement(Etichetta, null, "esito"),
            finale(c.stato) ? React.createElement(StatoBadge, { stato: c.stato }) : (React.createElement(React.Fragment, null,
                c.stato === "idea" && React.createElement(Button, { variant: "secondario", size: "sm", onClick: onModifica }, "Modifica nome e descrizione"),
                c.stato === "aperto" && React.createElement(Button, { variant: "secondario", size: "sm", onClick: () => onEsito("sospendi") }, "Sospendi"),
                c.stato === "sospeso" && React.createElement(Button, { size: "sm", onClick: () => onEsito("riattiva") }, "Riattiva"),
                React.createElement(Button, { variant: "fantasma", size: "sm", onClick: () => onEsito("abbandona") }, "Abbandona"),
                React.createElement(Button, { variant: "fantasma", size: "sm", onClick: onNuovaIdea }, "Nuova idea qui sotto"),
                React.createElement("span", { className: "nota" }, c.stato === "idea"
                    ? React.createElement(React.Fragment, null,
                        "Si prende in lavorazione da Claude Code con ",
                        React.createElement("code", null,
                            "/cantiere prendi ",
                            c.percorso),
                        ".")
                    : "Completato arriva dal repo, con openspec archive."))))));
}
export function SchedaProgetto({ p, committente, onNuovaIdea }) {
    const n = (s) => p.cantieri.filter((c) => c.stato === s).length;
    return (React.createElement("aside", { className: "scheda", "aria-label": "Scheda del progetto" },
        React.createElement(Blocco, { titolo: "progetto" }, React.createElement(Campi, { righe: [
                ["committente", committente],
                ["slug", React.createElement("code", null, p.slug)],
                ["creato", quando(p.creato_il)],
                ["in corso", n("aperto")],
                ["idee", n("idea")],
                ["sospesi", n("sospeso")],
                ["completati", n("completato")],
                ["non censite", p.non_censite],
            ] })),
        React.createElement("div", { className: "blocco azioni" },
            React.createElement(Etichetta, null, "azioni"),
            React.createElement(Button, { size: "sm", onClick: onNuovaIdea }, "Nuova idea"),
            React.createElement("span", { className: "nota" }, "Un'idea diventa un change OpenSpec con /cantiere prendi da Claude Code."))));
}
export function SchedaCommittente({ cm, onNuovoProgetto, onRigenera }) {
    return (React.createElement("aside", { className: "scheda", "aria-label": "Scheda del committente" },
        React.createElement(Blocco, { titolo: "committente" },
            React.createElement(Campi, { righe: [["nome", cm.nome], ["creato", quando(cm.creato_il)], ["token del", quando(cm.token_il)], ["progetti", cm.progetti.length]] })),
        React.createElement("div", { className: "blocco azioni" },
            React.createElement(Etichetta, null, "azioni"),
            React.createElement(Button, { size: "sm", onClick: onNuovoProgetto }, "Nuovo progetto"),
            React.createElement(Button, { variant: "secondario", size: "sm", onClick: onRigenera }, "Rigenera token"),
            React.createElement("span", { className: "nota" },
                "Il token serve a /cantiere collega su ogni macchina che lavora per ",
                cm.nome,
                "."))));
}
