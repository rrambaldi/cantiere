// Scheda «Task e rami» del cantiere: da chi è nato, i task di tasks.md e accanto a ciascuno i cantieri nati da lì.
import { api } from "./api.js";
import { Errore, useInvio } from "./comandi.js";
import { RigaMarkdown } from "./documento.js";
import { Button, Checkbox, Input } from "./ds/core.js";
import { StatoBadge } from "./ds/feedback.js";
import { T } from "./testi.js";
import { Avanzamento, BottoneIcona, Etichetta, Vuoto } from "./ui.js";
const TITOLO = /^#{2,}\s+(.*)$/;
const TASK = /^\s*- \[([^\]\n]{0,3})\](?:\s+(\d+(?:\.\d+)*)(?=\s|$))?\s*(.*)$/;
/** Titoli di sezione e task di un tasks.md; una riga rientrata continua il task di sopra, come in contaTask. */
export function righeTask(testo) {
    const righe = [];
    for (const riga of testo.split("\n")) {
        const titolo = TITOLO.exec(riga);
        const task = TASK.exec(riga);
        const ultima = righe[righe.length - 1];
        if (titolo)
            righe.push({ tipo: "titolo", testo: titolo[1] });
        else if (task)
            righe.push({ tipo: "task", fatto: task[1].trim().toLowerCase() === "x", numero: task[2] ?? null, testo: task[3] });
        else if (ultima?.tipo === "task" && /^\s+\S/.test(riga))
            ultima.testo += " " + riga.trim();
    }
    return righe;
}
/** Un cantiere legato: stato, nome (con il progetto se è un altro), avanzamento; un clic lo apre. Tratteggiato se solo citato. */
function Cartellino({ cantiere, progetto, percorso, qui, citato, task, onScegli }) {
    return (React.createElement("button", { className: citato ? "cartellino citato" : "cartellino", disabled: !cantiere, onClick: () => cantiere && onScegli({ tipo: "cantiere", id: cantiere.id }) },
        cantiere && React.createElement(StatoBadge, { stato: cantiere.stato, etichetta: false }),
        React.createElement("span", { className: "nome" }, progetto === qui ? percorso : `${progetto} / ${percorso}`),
        task && React.createElement("span", { className: "secondario" }, T.dalTask(task)),
        cantiere?.task && React.createElement(Avanzamento, { fatti: cantiere.task.fatti, totali: cantiere.task.totali, attivo: cantiere.stato === "aperto" }),
        citato && React.createElement("span", { className: "tag" }, T.citato)));
}
/** Le partenze possibili di `c`: non sé stesso, un suo padre o una sua fase (lì basta il padre), né quelle che ha già. */
function partenzePossibili(c, cantieri) {
    const padri = new Map(cantieri.map((x) => [x.id, x.padre_id]));
    const linea = (id) => {
        const ids = [];
        for (let x = id; x !== null; x = padri.get(x) ?? null)
            ids.push(x);
        return ids;
    };
    const antenati = linea(c.id);
    return cantieri.filter((x) => !antenati.includes(x.id) && !linea(x.id).includes(c.id) && !c.nato_da.some((l) => l.id === x.id));
}
/** «Nato da» messo dalla scheda: la partenza tra i cantieri del committente, prima quelli del progetto, e il task facoltativo. */
function MettiNatoDa({ c, cantieri, onAggiorna }) {
    const [aperto, setAperto] = React.useState(false);
    const [da, setDa] = React.useState(null);
    const [task, setTask] = React.useState("");
    const { inCorso, errore, invia } = useInvio();
    const possibili = partenzePossibili(c, cantieri);
    if (!aperto)
        return possibili.length ? React.createElement(Button, { size: "sm", variant: "secondario", onClick: () => setAperto(true) }, T.aggiungiNatoDa) : null;
    const progetti = [...new Set([c.progetto, ...possibili.map((x) => x.progetto).sort()])].filter((p) => possibili.some((x) => x.progetto === p));
    const chiudi = () => {
        setAperto(false);
        setDa(null);
        setTask("");
    };
    const lega = async () => {
        if (await invia(() => api.mettiNatoDa(c.id, da, task.trim() || null).then(onAggiorna)))
            chiudi();
    };
    return (React.createElement("div", { className: "metti-nato-da" },
        React.createElement("label", { className: "campo-scelta" },
            React.createElement("span", { className: "etichetta" }, T.partenza),
            React.createElement("select", { value: da ?? "", onChange: (e) => setDa(e.target.value ? Number(e.target.value) : null) },
                React.createElement("option", { value: "" }, T.scegliPartenza),
                progetti.map((p) => (React.createElement("optgroup", { key: p, label: p }, possibili.filter((x) => x.progetto === p).map((x) => React.createElement("option", { key: x.id, value: x.id }, x.percorso))))))),
        React.createElement(Input, { label: T.taskFacoltativo, hint: T.suggTask, value: task, onChange: setTask, mono: true }),
        React.createElement("span", { className: "azioni-esito" },
            React.createElement(Button, { size: "sm", disabled: inCorso || da === null, onClick: () => void lega() }, T.lega),
            React.createElement(Button, { size: "sm", variant: "fantasma", disabled: inCorso, onClick: chiudi }, T.annulla)),
        React.createElement(Errore, { testo: errore })));
}
export function TaskERami({ c, tasks, cantieri, onScegli, onAggiorna }) {
    const togli = useInvio();
    const perId = new Map(cantieri.map((x) => [x.id, x]));
    // Un livello solo, da qui ai cantieri legati: nessuna visita, quindi nessun rischio di giri.
    const rami = cantieri.flatMap((x) => x.nato_da.filter((l) => l.id === c.id).map((legame) => ({ x, legame })));
    const righe = tasks === null ? [] : righeTask(tasks);
    const numeri = new Set(righe.flatMap((r) => (r.tipo === "task" && r.numero ? [r.numero] : [])));
    const ramo = ({ x, legame }) => (React.createElement("li", { key: x.id },
        React.createElement(Cartellino, { cantiere: x, progetto: x.progetto, percorso: x.percorso, qui: c.progetto, citato: legame.tipo === "citato", onScegli: onScegli })));
    const sciolti = rami.filter((r) => !r.legame.task || !numeri.has(r.legame.task));
    return (React.createElement("div", { className: "task-rami" },
        React.createElement("div", { className: "testa-rami" },
            React.createElement("section", null,
                React.createElement(Etichetta, null, T.natoDa),
                c.nato_da.length ? (React.createElement("ul", null, c.nato_da.map((l) => (React.createElement("li", { key: l.id, className: "con-azione" },
                    React.createElement(Cartellino, { cantiere: perId.get(l.id), progetto: l.progetto, percorso: l.percorso, qui: c.progetto, citato: l.tipo === "citato", task: l.task, onScegli: onScegli }),
                    React.createElement(BottoneIcona, { icona: "chiudi", titolo: T.togliNatoDa(l.percorso), disabled: togli.inCorso, onClick: () => void togli.invia(() => api.togliNatoDa(c.id, l.id).then(onAggiorna)) })))))) : React.createElement(Vuoto, null, T.nessunaPartenza),
                React.createElement(Errore, { testo: togli.errore }),
                React.createElement(MettiNatoDa, { key: c.id, c: c, cantieri: cantieri, onAggiorna: onAggiorna })),
            React.createElement("section", null,
                React.createElement(Etichetta, null, T.ramiN(rami.length)),
                rami.length === 0 && React.createElement(Vuoto, null, T.nessunRamo),
                sciolti.length > 0 && React.createElement("ul", null, sciolti.map(ramo)),
                rami.length > sciolti.length && React.createElement("span", { className: "nota" }, T.ramiNeiTask(rami.length - sciolti.length)))),
        tasks === null ? React.createElement(Vuoto, null, T.nessunTasks) : (React.createElement("ul", { className: "righe-task" }, righe.map((r, i) => r.tipo === "titolo" ? React.createElement("li", { key: i, className: "titolo-task" }, r.testo) : (React.createElement("li", { key: i, className: "riga-task" },
            React.createElement(Checkbox, { checked: r.fatto, label: React.createElement(React.Fragment, null,
                    r.numero && React.createElement("b", { className: "numero-task" }, r.numero),
                    " ",
                    React.createElement(RigaMarkdown, { testo: r.testo })) }),
            React.createElement("ul", { className: "rami-del-task" }, rami.filter((x) => r.numero && x.legame.task === r.numero).map(ramo)))))))));
}
