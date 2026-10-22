import { Documento, EditorMarkdown, RigaMarkdown } from "./documento.js";
import { Nastro } from "./ds/cantiere.js";
import { Button, Checkbox, Input, Tabs } from "./ds/core.js";
import { SessioneBadge, StatoBadge } from "./ds/feedback.js";
import { eta, giorno, ora, quando } from "./formato.js";
import { T } from "./testi.js";
import { Avanzamento, Avviso, BottoneIcona, Etichetta, Pallino, Vuoto } from "./ui.js";
const FILE_AMMESSI = ".md,.txt,text/markdown,text/plain";
/** `barra`: il percorso e il bottone della scheda, sopra l'etichetta. */
function Testata({ etichetta, titolo, sotto, barra }) {
    return (React.createElement(React.Fragment, null,
        React.createElement(Nastro, { altezza: 6 }),
        React.createElement("header", { className: "testata griglia" },
            barra,
            React.createElement(Etichetta, null, etichetta),
            React.createElement("h1", { className: "titolo-lavoro" }, titolo),
            React.createElement("span", { className: "sotto" }, sotto))));
}
function RigaResoconto({ k, v }) {
    return (React.createElement("div", { className: "riga-resoconto" },
        React.createElement("span", null, k),
        React.createElement("span", { className: v ? "" : "vuota" }, v || "—")));
}
function Turni({ turni, vuoto }) {
    if (!turni.length)
        return React.createElement(Vuoto, null, vuoto);
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
                t.titolo || T.sessione + " " + t.session_id.slice(0, 8),
                t.percentuale != null ? ` · ${t.percentuale}%` : ""),
            React.createElement(RigaResoconto, { k: T.rFatto, v: t.fatto }),
            React.createElement(RigaResoconto, { k: T.rDopo, v: t.prossimo }),
            React.createElement(RigaResoconto, { k: T.rBlocca, v: t.bloccato_da })))))));
}
const ORDINE_FILE = ["proposal.md", "design.md", "tasks.md"];
const rango = (p) => {
    const i = ORDINE_FILE.indexOf(p);
    return i >= 0 ? i : p.startsWith("specs/") ? 3 : p.startsWith("idee/") ? 4 : 5;
};
function BottoneCopia({ testo }) {
    const [riuscita, setRiuscita] = React.useState(null);
    const copia = () => navigator.clipboard.writeText(testo).then(() => setRiuscita(true), () => setRiuscita(false));
    React.useEffect(() => {
        if (riuscita === null)
            return;
        const t = setTimeout(() => setRiuscita(null), 2000);
        return () => clearTimeout(t);
    }, [riuscita]);
    const esito = riuscita === null ? null : riuscita ? T.copiato : T.copiaNonRiuscita;
    return (React.createElement(React.Fragment, null,
        React.createElement(BottoneIcona, { icona: riuscita === null ? "copia" : riuscita ? "fatto" : "chiudi", titolo: esito ?? T.copiaAppunti, onClick: copia }),
        React.createElement("span", { className: "solo-lettori", role: "status" }, esito)));
}
const PREFISSO_IDEA = "idee/";
const nomeIdea = (f) => (f.percorso.startsWith(PREFISSO_IDEA) ? f.percorso.slice(PREFISSO_IDEA.length) : f.percorso);
/** Scarica il file con il suo percorso come nome: specs/a/spec.md diventa specs-a-spec.md. */
function salva(f) {
    const tipo = f.percorso.endsWith(".txt") ? "text/plain" : "text/markdown";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([f.contenuto], { type: tipo + ";charset=utf-8" }));
    a.download = nomeIdea(f).replace(/\//g, "-");
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href));
}
/**
 * Bozze aperte, una per cantiere: cambiando cantiere e tornando il testo scritto è ancora lì.
 * ParceEtRecte: stanno nella memoria della pagina; se servono anche dopo un ricaricamento, sessionStorage.
 */
const BOZZE = new Map();
// Chiudendo o ricaricando la pagina con una bozza aperta il browser chiede conferma. Nei test non c'è window.
globalThis.addEventListener?.("beforeunload", (e) => { if (BOZZE.size)
    e.preventDefault(); });
/** Elenco dei file e il file scelto, formattato. */
function Documenti({ file, vuoto, azioni, modifica }) {
    const ordinati = [...file].sort((a, b) => rango(a.percorso) - rango(b.percorso) || a.percorso.localeCompare(b.percorso));
    const [bozza, setBozzaStato] = React.useState(() => (modifica && BOZZE.get(modifica.cantiere)) ?? null);
    const [scelto, setScelto] = React.useState(bozza?.percorso ?? null);
    const [salvando, setSalvando] = React.useState(false);
    const setBozza = (b) => {
        if (modifica)
            b ? BOZZE.set(modifica.cantiere, b) : BOZZE.delete(modifica.cantiere);
        setBozzaStato(b);
    };
    const corrente = ordinati.find((f) => f.percorso === scelto) ?? ordinati[0];
    if (!corrente)
        return React.createElement(Vuoto, null, vuoto);
    const inModifica = modifica && bozza?.percorso === corrente.percorso ? bozza : null;
    // Se il salvataggio non riesce la bozza resta aperta; mentre salva, il testo e gli altri file restano fermi.
    const salvaBozza = async (b) => {
        const { cantiere, salva } = modifica;
        setSalvando(true);
        try {
            // Se intanto la bozza è cambiata (dalla barra dell'editor, o uscendo e rientrando), resta aperta col testo nuovo.
            if (!(await salva(corrente, b.contenuto)) || BOZZE.get(cantiere) !== b)
                return;
            BOZZE.delete(cantiere);
            setBozzaStato(null);
        }
        finally {
            setSalvando(false);
        }
    };
    return (React.createElement("div", { className: "documenti" },
        React.createElement("ul", { className: "elenco-file" }, ordinati.map((f) => (React.createElement("li", { key: f.percorso },
            React.createElement("button", { className: "voce-file" + (f === corrente ? " attiva" : ""), onClick: () => setScelto(f.percorso), disabled: !!inModifica && f !== corrente }, f.percorso))))),
        React.createElement("article", { className: "documento" },
            React.createElement("div", { className: "documento-testa" },
                React.createElement("code", null, corrente.percorso),
                React.createElement("span", { className: "azioni-documento" }, inModifica ? (React.createElement(React.Fragment, null,
                    React.createElement(BottoneIcona, { icona: "fatto", titolo: T.salvaModifiche, onClick: () => void salvaBozza(inModifica), disabled: salvando }),
                    React.createElement(BottoneIcona, { icona: "chiudi", titolo: T.annulla, onClick: () => setBozza(null), disabled: salvando }))) : (React.createElement(React.Fragment, null,
                    modifica && React.createElement(BottoneIcona, { icona: "modifica", titolo: T.modificaFile, onClick: () => setBozza(corrente) }),
                    React.createElement(BottoneCopia, { key: corrente.percorso, testo: corrente.contenuto }),
                    React.createElement(BottoneIcona, { icona: "scarica", titolo: T.salvaFile, onClick: () => salva(corrente) }),
                    azioni?.(corrente))))),
            inModifica
                ? React.createElement(EditorMarkdown, { valore: inModifica.contenuto, onCambia: (testo) => setBozza({ ...inModifica, contenuto: testo }), fermo: salvando, etichetta: `${T.modificaFile} ${corrente.percorso}` })
                : React.createElement(Documento, { percorso: corrente.percorso, contenuto: corrente.contenuto }))));
}
/** Zona dove trascinare o scegliere i file .md e .txt di un'idea. */
export function fileDaTesto(nome, testo) {
    const base = nome.trim().replace(/\.(md|txt)$/i, "") || "appunti";
    return new File([testo], `${base}.md`, { type: "text/markdown" });
}
export function CampoTesto({ scritto, setScritto, nome, setNome, azione }) {
    return (React.createElement(React.Fragment, null,
        React.createElement(Input, { label: T.scriviTesto, value: scritto, onChange: setScritto, multilinea: true }),
        scritto.trim() && (React.createElement("div", { className: "zona-file" },
            React.createElement(Input, { label: T.nomeAppunti, value: nome, onChange: setNome }),
            azione))));
}
export function ZonaFile({ onFile, testo = T.trascinaFile, conTesto = true }) {
    const [sopra, setSopra] = React.useState(false);
    const [scritto, setScritto] = React.useState("");
    const [nome, setNome] = React.useState("appunti");
    const input = React.useRef(null);
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "zona-file" + (sopra ? " sopra" : ""), onDragOver: (e) => { e.preventDefault(); setSopra(true); }, onDragLeave: () => setSopra(false), onDrop: (e) => { e.preventDefault(); setSopra(false); onFile([...e.dataTransfer.files]); } },
            React.createElement("span", null, testo),
            React.createElement(Button, { variant: "secondario", size: "sm", onClick: () => input.current?.click() }, T.scegliFile),
            React.createElement("input", { ref: input, type: "file", multiple: true, accept: FILE_AMMESSI, hidden: true, onChange: (e) => { onFile([...(e.target.files ?? [])]); e.target.value = ""; } })),
        conTesto && React.createElement(CampoTesto, { scritto: scritto, setScritto: setScritto, nome: nome, setNome: setNome, azione: React.createElement(Button, { variant: "secondario", size: "sm", onClick: () => { onFile([fileDaTesto(nome, scritto)]); setScritto(""); } }, T.aggiungiTesto) })));
}
export function LavoroCantiere({ d, onFile, onSalvaFile, onTogliFile, barra }) {
    const c = d.cantiere;
    const idea = c.stato === "idea";
    const daFare = d.task_aperti.length > 0;
    const prima = daFare ? "daFare" : "giornale";
    const [scheda, setScheda] = React.useState(prima);
    React.useEffect(() => setScheda(prima), [c.id]);
    // Spuntato l'ultimo task, la scheda «Da fare» sparisce: si torna al giornale.
    const vista = scheda === "daFare" && !daFare ? "giornale" : scheda;
    const macchine = new Set(d.turni.map((t) => t.host)).size;
    // Un'idea con la copia di un change archiviato con lo stesso nome mostra quella: si modificano e si tolgono solo i file dell'idea.
    const fileIdea = d.file.every((f) => f.percorso.startsWith(PREFISSO_IDEA));
    // Una bozza vive finché il suo file si può modificare: con l'idea abbandonata o presa, o il file tolto altrove, il
    // server non la accetterebbe più e il browser non deve chiedere conferma per un testo che non si vede.
    const bozzaValida = idea && fileIdea && d.file.some((f) => f.percorso === BOZZE.get(c.id)?.percorso);
    // A ogni render: la bozza nasce dentro Documenti, senza che questo componente lo sappia.
    React.useEffect(() => { if (!bozzaValida)
        BOZZE.delete(c.id); });
    const sotto = [
        c.progetto,
        T.changeNome(c.change),
        T.stato[c.stato],
        T.creatoIl(giorno(c.creato_il)),
        ...(idea ? [] : [d.turni.length ? T.turniSu(d.turni.length, macchine) : T.nessunTurno]),
    ].join(" · ");
    return (React.createElement("main", { className: "lavori" },
        React.createElement(Testata, { etichetta: idea ? T.stato.idea : T.giornaleLavori, titolo: c.percorso, sotto: sotto, barra: barra }),
        React.createElement("div", { className: "corpo-lavoro" },
            c.descrizione && React.createElement("p", { className: "descrizione" }, c.descrizione),
            React.createElement(DomandeInAttesa, { domande: c.domande }),
            c.change_mancante && c.stato === "aperto" && (React.createElement(Avviso, null,
                T.avvisoChangeMancante[0],
                React.createElement("code", null, c.change),
                T.avvisoChangeMancante[1],
                React.createElement("code", null,
                    "openspec new change ",
                    c.change),
                T.avvisoChangeMancante[2])),
            c.da_archiviare && (React.createElement(Avviso, null,
                T.avvisoDaArchiviare(c.progetto)[0],
                React.createElement("code", null,
                    "openspec archive ",
                    c.change,
                    " --skip-specs"),
                T.avvisoDaArchiviare(c.progetto)[1])),
            idea ? (React.createElement(React.Fragment, null,
                React.createElement(Etichetta, null, T.fileIdea(d.file.length)),
                React.createElement(ZonaFile, { onFile: onFile }),
                React.createElement(Documenti, { key: c.id, file: d.file, vuoto: T.nessunFileIdea, modifica: fileIdea ? { cantiere: c.id, salva: (f, testo) => onSalvaFile(nomeIdea(f), testo) } : undefined, azioni: fileIdea ? (f) => React.createElement(BottoneIcona, { icona: "cestino", titolo: T.togli, onClick: () => onTogliFile(nomeIdea(f)) }) : undefined }))) : (React.createElement(React.Fragment, null,
                React.createElement(Tabs, { value: vista, onChange: setScheda, items: [
                        ...(daFare ? [{ id: "daFare", label: T.daFareScheda, count: d.task_aperti.length }] : []),
                        { id: "giornale", label: T.giornale, count: d.turni.length },
                        { id: "change", label: T.changeScheda, count: d.file.length },
                    ] }),
                vista === "daFare"
                    ? React.createElement("ul", { className: "task-aperti" }, d.task_aperti.map((t, i) => React.createElement("li", { key: i },
                        React.createElement(Checkbox, { checked: false, label: React.createElement(RigaMarkdown, { testo: t }) }))))
                    : vista === "giornale"
                        ? React.createElement(Turni, { turni: d.turni, vuoto: c.origine === "repo" ? T.nessunResocontoRepo(quando(c.creato_il)) : T.nessunResoconto })
                        : React.createElement(Documenti, { file: d.file, vuoto: T.nessunaCopiaChange }))))));
}
/** Le domande che le sessioni del cantiere hanno fatto e che aspettano risposta (solo lettura). */
function DomandeInAttesa({ domande }) {
    if (!domande.length)
        return null;
    return (React.createElement("section", { className: "domande-attesa", "aria-label": T.inAttesaTitolo },
        React.createElement(Etichetta, null,
            React.createElement(Pallino, { n: 1 }),
            " ",
            T.inAttesaTitolo),
        domande.map((d) => (React.createElement("article", { key: d.session_id + d.id, className: "domanda" },
            React.createElement("p", { className: "testo-domanda" }, d.tipo === "attesa" && !d.testo ? T.domandaAttesa : d.testo),
            d.opzioni.length > 0 && React.createElement("ul", { className: "opzioni-domanda" }, d.opzioni.map((o, i) => React.createElement("li", { key: i }, o))),
            React.createElement("span", { className: "secondario" },
                d.host,
                " \u00B7 ",
                React.createElement("code", null, d.session_id.slice(0, 8)),
                " \u00B7 ",
                T.inAttesaDa(eta(d.eta_secondi)))))),
        React.createElement("span", { className: "secondario" }, T.inAttesaNota)));
}
function RigaCantiere({ c, onScegli }) {
    return (React.createElement("button", { className: "riga-cantiere", onClick: () => onScegli({ tipo: "cantiere", id: c.id }) },
        React.createElement("span", { className: "nome" },
            c.percorso,
            " ",
            React.createElement(Pallino, { n: c.domande_in_attesa })),
        React.createElement("span", { className: "secondario" }, c.sessioni.map((s) => s.host).join(" · ") || "—"),
        c.task ? React.createElement(Avanzamento, { fatti: c.task.fatti, totali: c.task.totali, attivo: c.stato === "aperto" }) : React.createElement("span", { className: "secondario" }, "\u2014"),
        React.createElement(StatoBadge, { stato: c.stato })));
}
/** Doppio click (o Invio) apre sotto la riga l'ultimo messaggio di stato della sessione. */
function RigaNonCensita({ s }) {
    const [aperta, setAperta] = React.useState(false);
    const u = s.ultimo_stato;
    return (React.createElement(React.Fragment, null,
        React.createElement("tr", { className: "apribile", tabIndex: 0, title: T.apriUltimoStato, "aria-expanded": aperta, onDoubleClick: () => setAperta(!aperta), onKeyDown: (e) => e.key === "Enter" && setAperta(!aperta), onMouseDown: (e) => e.detail > 1 && e.preventDefault() },
            React.createElement("td", null, s.titolo ?? React.createElement("span", { className: "secondario" },
                T.sessione,
                " ",
                s.session_id.slice(0, 8))),
            React.createElement("td", null, s.host),
            React.createElement("td", null, quando(s.avviata_il)),
            React.createElement("td", null, quando(s.ultimo_evento_il)),
            React.createElement("td", { className: "numero" }, s.turni),
            React.createElement("td", null,
                React.createElement(SessioneBadge, { stato: s.stato }))),
        aperta && (React.createElement("tr", { className: "ultimo-stato" },
            React.createElement("td", { colSpan: 6 }, u ? (React.createElement("div", { className: "resoconto-sessione" },
                React.createElement("span", { className: "etichetta" }, T.ultimoStatoDel(quando(u.ts))),
                React.createElement(RigaResoconto, { k: T.rFatto, v: u.fatto }),
                React.createElement(RigaResoconto, { k: T.rDopo, v: u.prossimo }),
                u.bloccato_da && React.createElement(RigaResoconto, { k: T.rBlocca, v: u.bloccato_da }))) : React.createElement("span", { className: "secondario" }, T.nessunoStato))))));
}
export function LavoroProgetto({ p, committente, nonCensite, onScegli, barra }) {
    const attivi = p.cantieri.filter((c) => c.stato === "aperto" || c.stato === "sospeso" || c.stato === "idea");
    return (React.createElement("main", { className: "lavori" },
        React.createElement(Testata, { etichetta: T.progetto, titolo: p.nome, sotto: T.progettoSotto(committente, p.cantieri.length, giorno(p.creato_il)), barra: barra }),
        React.createElement("div", { className: "corpo-lavoro" },
            React.createElement("section", { className: "sezione" },
                React.createElement(Etichetta, null, T.cantieriApertiIdee),
                attivi.length ? React.createElement("div", { className: "righe" }, attivi.map((c) => React.createElement(RigaCantiere, { key: c.id, c: c, onScegli: onScegli })))
                    : React.createElement(Vuoto, null, T.nessunCantiereAperto)),
            React.createElement("section", { className: "sezione" },
                React.createElement(Etichetta, null, T.attivitaNonCensite),
                nonCensite === null ? React.createElement(Vuoto, null, T.caricamento) : nonCensite.length === 0
                    ? React.createElement(Vuoto, null, T.nessunaNonCensita(p.nome))
                    : (React.createElement("div", { className: "tabella-scorre" },
                        React.createElement("table", { className: "tabella" },
                            React.createElement("thead", null,
                                React.createElement("tr", null,
                                    React.createElement("th", null, T.colTitolo),
                                    React.createElement("th", null, T.colMacchina),
                                    React.createElement("th", null, T.colAvviata),
                                    React.createElement("th", null, T.colUltimoEvento),
                                    React.createElement("th", { className: "numero" }, T.colTurni),
                                    React.createElement("th", null, T.colStato))),
                            React.createElement("tbody", null, nonCensite.map((s) => React.createElement(RigaNonCensita, { key: s.session_id, s: s }))))))))));
}
export function LavoroCommittente({ cm, onScegli, barra }) {
    return (React.createElement("main", { className: "lavori" },
        React.createElement(Testata, { etichetta: T.committente, titolo: cm.nome, sotto: T.committenteSotto(cm.progetti.length, giorno(cm.creato_il)), barra: barra }),
        React.createElement("div", { className: "corpo-lavoro" },
            React.createElement("section", { className: "sezione" },
                React.createElement(Etichetta, null, T.progetti),
                cm.progetti.length === 0 ? React.createElement(Vuoto, null, T.nessunProgetto) : (React.createElement("div", { className: "righe" }, cm.progetti.map((p) => {
                    const n = (s) => p.cantieri.filter((c) => c.stato === s).length;
                    return (React.createElement("button", { key: p.id, className: "riga-progetto", onClick: () => onScegli({ tipo: "progetto", id: p.id }) },
                        React.createElement("span", { className: "nome" }, p.nome),
                        React.createElement("span", { className: "secondario" }, T.riepilogoProgetto(n("aperto"), n("idea"), n("completato"))),
                        React.createElement("span", { className: "secondario" }, T.nonCensiteN(p.non_censite))));
                })))))));
}
