import { Documento } from "./documento.js";
import { Nastro } from "./ds/cantiere.js";
import { Button, Tabs } from "./ds/core.js";
import { StatoBadge } from "./ds/feedback.js";
import { ETICHETTA_STATO, giorno, ora, quando } from "./formato.js";
import { Avanzamento, Avviso, Etichetta, Vuoto } from "./ui.js";
const FILE_AMMESSI = ".md,.txt,text/markdown,text/plain";
function Testata({ etichetta, titolo, sotto }) {
    return (React.createElement(React.Fragment, null,
        React.createElement(Nastro, { altezza: 6 }),
        React.createElement("header", { className: "testata griglia" },
            React.createElement(Etichetta, null, etichetta),
            React.createElement("h1", { className: "titolo-lavoro" }, titolo),
            React.createElement("span", { className: "sotto" }, sotto))));
}
function RigaResoconto({ k, v }) {
    return (React.createElement("div", { className: "riga-resoconto" },
        React.createElement("span", null, k),
        React.createElement("span", { className: v ? "" : "vuota" }, v || "—")));
}
function Turni({ turni }) {
    if (!turni.length)
        return React.createElement(Vuoto, null, "Nessun resoconto ancora. Arriva quando Claude chiude un turno con aggiorna_stato.");
    return (React.createElement("ol", { className: "turni" }, turni.map((t, i) => (React.createElement("li", { key: t.ts + t.session_id, className: "turno" },
        React.createElement("div", { className: "turno-quando" },
            React.createElement("strong", null, giorno(t.ts)),
            React.createElement("span", null, ora(t.ts)),
            React.createElement("span", { className: "host", title: t.host }, t.host)),
        React.createElement("div", { className: "turno-filo", "aria-hidden": "true" },
            React.createElement("span", { className: "filo", style: { height: 18 } }),
            React.createElement("span", { className: "nodo" + (t.bloccato_da ? " bloccato" : "") }),
            i < turni.length - 1 && React.createElement("span", { className: "filo", style: { flex: 1 } })),
        React.createElement("div", { className: "turno-corpo" + (i < turni.length - 1 ? " con-linea" : "") },
            React.createElement("span", { className: "etichetta" },
                t.titolo || "sessione " + t.session_id.slice(0, 8),
                t.percentuale != null ? ` · ${t.percentuale}%` : ""),
            React.createElement(RigaResoconto, { k: "fatto", v: t.fatto }),
            React.createElement(RigaResoconto, { k: "dopo", v: t.prossimo }),
            React.createElement(RigaResoconto, { k: "blocca", v: t.bloccato_da })))))));
}
const ORDINE_FILE = ["proposal.md", "design.md", "tasks.md"];
const rango = (p) => {
    const i = ORDINE_FILE.indexOf(p);
    return i >= 0 ? i : p.startsWith("specs/") ? 3 : p.startsWith("idee/") ? 4 : 5;
};
/** Elenco dei file e il file scelto, formattato. */
function Documenti({ file, vuoto, azioni }) {
    const ordinati = [...file].sort((a, b) => rango(a.percorso) - rango(b.percorso) || a.percorso.localeCompare(b.percorso));
    const [scelto, setScelto] = React.useState(null);
    const corrente = ordinati.find((f) => f.percorso === scelto) ?? ordinati[0];
    if (!corrente)
        return React.createElement(Vuoto, null, vuoto);
    return (React.createElement("div", { className: "documenti" },
        React.createElement("ul", { className: "elenco-file" }, ordinati.map((f) => (React.createElement("li", { key: f.percorso },
            React.createElement("button", { className: "voce-file" + (f === corrente ? " attiva" : ""), onClick: () => setScelto(f.percorso) }, f.percorso))))),
        React.createElement("article", { className: "documento" },
            React.createElement("div", { className: "documento-testa" },
                React.createElement("code", null, corrente.percorso),
                azioni?.(corrente)),
            React.createElement(Documento, { percorso: corrente.percorso, contenuto: corrente.contenuto }))));
}
/** Zona dove trascinare o scegliere i file .md e .txt di un'idea. */
export function ZonaFile({ onFile, testo = "Trascina qui file .md o .txt, oppure sceglili" }) {
    const [sopra, setSopra] = React.useState(false);
    const input = React.useRef(null);
    return (React.createElement("div", { className: "zona-file" + (sopra ? " sopra" : ""), onDragOver: (e) => { e.preventDefault(); setSopra(true); }, onDragLeave: () => setSopra(false), onDrop: (e) => { e.preventDefault(); setSopra(false); onFile([...e.dataTransfer.files]); } },
        React.createElement("span", null, testo),
        React.createElement(Button, { variant: "secondario", size: "sm", onClick: () => input.current?.click() }, "Scegli file"),
        React.createElement("input", { ref: input, type: "file", multiple: true, accept: FILE_AMMESSI, hidden: true, onChange: (e) => { onFile([...(e.target.files ?? [])]); e.target.value = ""; } })));
}
export function LavoroCantiere({ d, onFile, onTogliFile }) {
    const c = d.cantiere;
    const idea = c.stato === "idea";
    const [scheda, setScheda] = React.useState("giornale");
    React.useEffect(() => setScheda("giornale"), [c.id]);
    const macchine = new Set(d.turni.map((t) => t.host)).size;
    const sotto = [
        c.progetto,
        `change ${c.change}`,
        ETICHETTA_STATO[c.stato],
        `creato ${giorno(c.creato_il)}`,
        ...(idea ? [] : [d.turni.length ? `${d.turni.length} ${d.turni.length === 1 ? "turno" : "turni"} su ${macchine} ${macchine === 1 ? "macchina" : "macchine"}` : "nessun turno"]),
    ].join(" · ");
    return (React.createElement("main", { className: "lavori" },
        React.createElement(Testata, { etichetta: idea ? "idea" : "giornale dei lavori", titolo: c.percorso, sotto: sotto }),
        React.createElement("div", { className: "corpo-lavoro" },
            c.descrizione && React.createElement("p", { className: "descrizione" }, c.descrizione),
            c.change_mancante && c.stato === "aperto" && (React.createElement(Avviso, null,
                "Il change ",
                React.createElement("code", null, c.change),
                " non c'\u00E8 ancora nel repo. Lo crea Claude con ",
                React.createElement("code", null,
                    "openspec new change ",
                    c.change),
                ".")),
            c.da_archiviare && (React.createElement(Avviso, null,
                "Abbandonato, ma il change \u00E8 ancora nel repo. Alla prossima sessione in ",
                c.progetto,
                " Claude proporr\u00E0 ",
                React.createElement("code", null,
                    "openspec archive ",
                    c.change,
                    " --skip-specs"),
                ".")),
            idea ? (React.createElement(React.Fragment, null,
                React.createElement(Etichetta, null,
                    "file dell'idea \u00B7 ",
                    d.file.length),
                React.createElement(ZonaFile, { onFile: onFile }),
                React.createElement(Documenti, { file: d.file, vuoto: "Nessun file. Aggiungi gli appunti da cui Claude partir\u00E0 per scrivere il change.", azioni: (f) => React.createElement(Button, { variant: "fantasma", size: "sm", onClick: () => onTogliFile(f.percorso.replace(/^idee\//, "")) }, "Togli") }))) : (React.createElement(React.Fragment, null,
                React.createElement(Tabs, { value: scheda, onChange: setScheda, items: [
                        { id: "giornale", label: "Giornale", count: d.turni.length },
                        { id: "change", label: "Change", count: d.file.length },
                    ] }),
                scheda === "giornale"
                    ? React.createElement(Turni, { turni: d.turni })
                    : React.createElement(Documenti, { file: d.file, vuoto: "Nessuna copia del change. Arriva dal plugin alla fine del primo turno che tocca openspec/changes/." }))))));
}
function RigaCantiere({ c, onScegli }) {
    return (React.createElement("button", { className: "riga-cantiere", onClick: () => onScegli({ tipo: "cantiere", id: c.id }) },
        React.createElement("span", { className: "nome" }, c.percorso),
        React.createElement("span", { className: "secondario" }, c.sessioni.map((s) => s.host).join(" · ") || "—"),
        c.task ? React.createElement(Avanzamento, { fatti: c.task.fatti, totali: c.task.totali, attivo: c.stato === "aperto" }) : React.createElement("span", { className: "secondario" }, "\u2014"),
        React.createElement(StatoBadge, { stato: c.stato })));
}
export function LavoroProgetto({ p, committente, nonCensite, onScegli }) {
    const attivi = p.cantieri.filter((c) => c.stato === "aperto" || c.stato === "sospeso" || c.stato === "idea");
    return (React.createElement("main", { className: "lavori" },
        React.createElement(Testata, { etichetta: "progetto", titolo: p.nome, sotto: `${committente} · ${p.cantieri.length} cantieri · creato ${giorno(p.creato_il)}` }),
        React.createElement("div", { className: "corpo-lavoro" },
            React.createElement("section", { className: "sezione" },
                React.createElement(Etichetta, null, "cantieri aperti e idee"),
                attivi.length ? React.createElement("div", { className: "righe" }, attivi.map((c) => React.createElement(RigaCantiere, { key: c.id, c: c, onScegli: onScegli })))
                    : React.createElement(Vuoto, null, "Nessun cantiere aperto. Crea un'idea dalla scheda a destra, oppure aprilo da Claude Code.")),
            React.createElement("section", { className: "sezione" },
                React.createElement(Etichetta, null, "attivit\u00E0 non censite"),
                nonCensite === null ? React.createElement(Vuoto, null, "Caricamento.") : nonCensite.length === 0
                    ? React.createElement(Vuoto, null,
                        "Nessuna. Qui finisce il lavoro fatto su ",
                        p.nome,
                        " senza un cantiere.")
                    : (React.createElement("div", { className: "tabella-scorre" },
                        React.createElement("table", { className: "tabella" },
                            React.createElement("thead", null,
                                React.createElement("tr", null,
                                    React.createElement("th", null, "titolo"),
                                    React.createElement("th", null, "macchina"),
                                    React.createElement("th", null, "avviata"),
                                    React.createElement("th", null, "ultimo evento"),
                                    React.createElement("th", { className: "numero" }, "turni"),
                                    React.createElement("th", null, "stato"))),
                            React.createElement("tbody", null, nonCensite.map((s) => (React.createElement("tr", { key: s.session_id },
                                React.createElement("td", null, s.titolo ?? React.createElement("span", { className: "secondario" },
                                    "sessione ",
                                    s.session_id.slice(0, 8))),
                                React.createElement("td", null, s.host),
                                React.createElement("td", null, quando(s.avviata_il)),
                                React.createElement("td", null, quando(s.ultimo_evento_il)),
                                React.createElement("td", { className: "numero" }, s.turni),
                                React.createElement("td", null, s.stato))))))))))));
}
export function LavoroCommittente({ cm, onScegli }) {
    return (React.createElement("main", { className: "lavori" },
        React.createElement(Testata, { etichetta: "committente", titolo: cm.nome, sotto: `${cm.progetti.length} progetti · creato ${giorno(cm.creato_il)}` }),
        React.createElement("div", { className: "corpo-lavoro" },
            React.createElement("section", { className: "sezione" },
                React.createElement(Etichetta, null, "progetti"),
                cm.progetti.length === 0 ? React.createElement(Vuoto, null, "Nessun progetto. Crealo dalla scheda a destra, oppure con /cantiere collega da Claude Code.") : (React.createElement("div", { className: "righe" }, cm.progetti.map((p) => {
                    const n = (s) => p.cantieri.filter((c) => c.stato === s).length;
                    return (React.createElement("button", { key: p.id, className: "riga-progetto", onClick: () => onScegli({ tipo: "progetto", id: p.id }) },
                        React.createElement("span", { className: "nome" }, p.nome),
                        React.createElement("span", { className: "secondario" },
                            n("aperto"),
                            " in corso \u00B7 ",
                            n("idea"),
                            " idee \u00B7 ",
                            n("completato"),
                            " completati"),
                        React.createElement("span", { className: "secondario" },
                            p.non_censite,
                            " non censite")));
                })))))));
}
