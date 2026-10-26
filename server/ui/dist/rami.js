import { RigaMarkdown } from "./documento.js";
import { Checkbox } from "./ds/core.js";
import { StatoBadge } from "./ds/feedback.js";
import { T } from "./testi.js";
import { Avanzamento, Etichetta, Vuoto } from "./ui.js";
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
export function TaskERami({ c, tasks, cantieri, onScegli }) {
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
                c.nato_da.length ? (React.createElement("ul", null, c.nato_da.map((l) => (React.createElement("li", { key: l.id },
                    React.createElement(Cartellino, { cantiere: perId.get(l.id), progetto: l.progetto, percorso: l.percorso, qui: c.progetto, citato: l.tipo === "citato", task: l.task, onScegli: onScegli })))))) : React.createElement(Vuoto, null, T.nessunaPartenza)),
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
