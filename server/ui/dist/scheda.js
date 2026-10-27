import { ComandiSessione, ListaComandi } from "./comandi.js";
import { Button, Checkbox } from "./ds/core.js";
import { StatoBadge } from "./ds/feedback.js";
import { eta, finale, giorno, quando } from "./formato.js";
import { T } from "./testi.js";
import { Avanzamento, BottoneIcona, Campi, Etichetta, Vuoto } from "./ui.js";
const ARTEFATTI = ["proposal", "design", "specs", "tasks"];
/** «3 subagenti · 2 Explore · 1 general-purpose»: i più usati per primi. */
const subagenti = (conti) => {
    const tipi = Object.entries(conti).sort((a, b) => b[1] - a[1]);
    return T.subagentiN(tipi.reduce((n, [, k]) => n + k, 0), tipi.map(([tipo, k]) => `${k} ${tipo}`).join(" · "));
};
/** Al telefono la scheda è un foglio dal basso, sopra un velo; chi lo apre rende inerte il resto della pagina. */
export function Foglio({ onChiudi, esc, children }) {
    const chiudi = React.useRef(null);
    // Aperto, il fuoco entra nel foglio; dove torna alla chiusura lo decide chi lo apre.
    React.useEffect(() => chiudi.current?.querySelector("button")?.focus(), []);
    // Esc lo chiude, salvo con un dialogo aperto sopra: Esc è suo, o di nessuno per quelli che si chiudono coi bottoni.
    React.useEffect(() => {
        if (!esc)
            return;
        const tasto = (e) => e.key === "Escape" && onChiudi();
        document.addEventListener("keydown", tasto);
        return () => document.removeEventListener("keydown", tasto);
    }, [esc, onChiudi]);
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "velo", "aria-hidden": "true", onClick: onChiudi }),
        React.createElement("div", { className: "foglio", role: "dialog", "aria-modal": "true", "aria-label": T.schedaTecnica },
            React.createElement("div", { ref: chiudi, className: "chiudi-foglio" },
                React.createElement(BottoneIcona, { icona: "chiudi", titolo: T.chiudiScheda, onClick: onChiudi })),
            children)));
}
function Blocco({ titolo, children }) {
    return React.createElement("div", { className: "blocco" },
        React.createElement(Etichetta, null, titolo),
        children);
}
export function SchedaCantiere({ d, onEsito, onModifica, onNuovaIdea, onAggiorna }) {
    const c = d.cantiere;
    // Gli esiti dei task stanno sui task; quelli delle sessioni attive sotto la loro sessione.
    const attive = new Set(c.sessioni.map((s) => s.session_id));
    const diSessione = d.comandi.filter((x) => x.task === null && x.session_id !== null);
    const ferme = diSessione.filter((x) => !attive.has(x.session_id));
    return (React.createElement("aside", { className: "scheda", "aria-label": T.schedaTecnica },
        React.createElement(Blocco, { titolo: T.schedaTecnicaEt }, React.createElement(Campi, { righe: [
                [T.progetto, c.progetto],
                [T.change, React.createElement("code", null, c.change)],
                [T.stato_, React.createElement(StatoBadge, { stato: c.stato })],
                [T.origine, T.origini[c.origine]],
                [T.creato, quando(c.creato_il)],
                [T.aggiornato, quando(c.aggiornato_il)],
            ] })),
        c.stato !== "idea" && (React.createElement(Blocco, { titolo: T.avanzamento },
            c.task ? React.createElement(Campi, { righe: [[T.task, React.createElement(Avanzamento, { fatti: c.task.fatti, totali: c.task.totali, attivo: c.stato === "aperto" })]] })
                : React.createElement(Vuoto, null, T.nessunTasks),
            c.fasi && React.createElement(Campi, { righe: [[T.fasi, React.createElement(Avanzamento, { fatti: c.fasi.completate, totali: c.fasi.totali, attivo: c.stato === "aperto" })]] }),
            c.artefatti && (React.createElement("ul", { className: "artefatti" }, ARTEFATTI.map((a) => React.createElement("li", { key: a, className: c.artefatti[a] ? "c-e" : "" },
                c.artefatti[a] ? "✓" : "—",
                " ",
                a)))))),
        c.sessioni.length > 0 && (React.createElement(Blocco, { titolo: T.sessioniAttive },
            React.createElement("ul", { className: "sessioni" }, c.sessioni.map((s) => (React.createElement("li", { key: s.session_id },
                React.createElement("span", null,
                    s.host,
                    s.branch ? ` · ${s.branch}` : ""),
                React.createElement("span", { className: "secondario" },
                    s.titolo ?? T.statoSessione[s.stato],
                    " \u00B7 ",
                    eta(s.eta_secondi)),
                Object.keys(s.subagenti).length > 0 && React.createElement("span", { className: "secondario" }, subagenti(s.subagenti)),
                React.createElement(ComandiSessione, { sessionId: s.session_id, comandi: diSessione.filter((x) => x.session_id === s.session_id), onAggiorna: onAggiorna }))))))),
        ferme.length > 0 && (React.createElement(Blocco, { titolo: T.comandiSessioniFerme },
            React.createElement(ListaComandi, { comandi: ferme, onAggiorna: onAggiorna }))),
        d.todo.length > 0 && (React.createElement(Blocco, { titolo: T.todoSessioni }, d.todo.map((t, i) => (React.createElement(Checkbox, { key: i, checked: t.stato === "completed", label: React.createElement("span", { style: { color: t.stato === "completed" ? "var(--testo-2)" : "var(--testo)" } },
                t.testo,
                t.stato === "in_progress" ? T.inCorsoTodo : "") }))))),
        d.esiti.length > 0 && (React.createElement(Blocco, { titolo: T.storico },
            React.createElement("ul", { className: "storico" }, d.esiti.map((e, i) => React.createElement("li", { key: i },
                React.createElement(StatoBadge, { stato: e.stato }),
                " ",
                React.createElement("span", { className: "secondario" },
                    giorno(e.ts),
                    " \u00B7 ",
                    T.origini[e.da])))))),
        React.createElement("div", { className: "blocco azioni" },
            React.createElement(Etichetta, null, T.esito),
            finale(c.stato) ? React.createElement(StatoBadge, { stato: c.stato }) : (React.createElement(React.Fragment, null,
                c.stato === "idea" && React.createElement(Button, { variant: "secondario", size: "sm", onClick: onModifica }, T.modificaNomeDescr),
                c.stato === "aperto" && React.createElement(Button, { variant: "secondario", size: "sm", onClick: () => onEsito("sospendi") }, T.sospendi),
                c.stato === "sospeso" && React.createElement(Button, { size: "sm", onClick: () => onEsito("riattiva") }, T.riattiva),
                React.createElement(Button, { variant: "fantasma", size: "sm", onClick: () => onEsito("abbandona") }, T.abbandona),
                React.createElement(Button, { variant: "fantasma", size: "sm", onClick: onNuovaIdea }, T.nuovaIdeaSotto),
                React.createElement("span", { className: "nota" }, c.stato === "idea"
                    ? React.createElement(React.Fragment, null,
                        T.notaIdea[0],
                        React.createElement("code", null,
                            "/cantiere prendi ",
                            c.percorso),
                        T.notaIdea[1])
                    : T.notaCompletato))))));
}
export function SchedaProgetto({ p, committente, onNuovaIdea }) {
    const n = (s) => p.cantieri.filter((c) => c.stato === s).length;
    return (React.createElement("aside", { className: "scheda", "aria-label": T.schedaProgetto },
        React.createElement(Blocco, { titolo: T.progetto }, React.createElement(Campi, { righe: [
                [T.committente, committente],
                [T.slug, React.createElement("code", null, p.slug)],
                [T.creato, quando(p.creato_il)],
                [T.inCorso, n("aperto")],
                [T.idee.toLowerCase(), n("idea")],
                [T.sospesi, n("sospeso")],
                [T.completati, n("completato")],
                [T.nonCensite, p.non_censite],
            ] })),
        React.createElement("div", { className: "blocco azioni" },
            React.createElement(Etichetta, null, T.azioni),
            React.createElement(Button, { size: "sm", onClick: onNuovaIdea }, T.nuovaIdea),
            React.createElement("span", { className: "nota" }, T.notaProgetto))));
}
export function SchedaCommittente({ cm, onNuovoProgetto, onRigenera }) {
    return (React.createElement("aside", { className: "scheda", "aria-label": T.schedaCommittente },
        React.createElement(Blocco, { titolo: T.committente },
            React.createElement(Campi, { righe: [[T.nome, cm.nome], [T.creato, quando(cm.creato_il)], [T.tokenDel, quando(cm.token_il)], [T.progetti, cm.progetti.length]] })),
        React.createElement("div", { className: "blocco azioni" },
            React.createElement(Etichetta, null, T.azioni),
            React.createElement(Button, { size: "sm", onClick: onNuovoProgetto }, T.nuovoProgetto),
            React.createElement(Button, { variant: "secondario", size: "sm", onClick: onRigenera }, T.rigeneraToken),
            React.createElement("span", { className: "nota" }, T.notaCommittente(cm.nome)))));
}
