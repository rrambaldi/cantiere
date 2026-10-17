import { T } from "./testi.js";
export function Etichetta({ children }) {
    return React.createElement("span", { className: "etichetta" }, children);
}
/** Coppie nome · valore in colonna, come la scheda tecnica del prototipo. */
export function Campi({ righe }) {
    return (React.createElement("dl", { className: "campi" }, righe.map(([k, v]) => (React.createElement(React.Fragment, { key: k },
        React.createElement("dt", null, k),
        React.createElement("dd", null, v ?? "—"))))));
}
/** Pallino rosso delle domande in attesa; il numero compare solo se sono più di una. */
export function Pallino({ n }) {
    if (n <= 0)
        return null;
    const testo = T.domandeInAttesaN(n);
    return React.createElement("span", { className: "pallino", role: "img", "aria-label": testo, title: testo }, n > 1 ? n : null);
}
export function Avviso({ children }) {
    return React.createElement("div", { className: "avviso" }, children);
}
export function Vuoto({ children }) {
    return React.createElement("p", { className: "vuoto" }, children);
}
/** Conteggio asciutto (7/12) con la barra sottile del design system. */
export function Avanzamento({ fatti, totali, attivo = true }) {
    const pct = totali ? Math.round((fatti / totali) * 100) : 0;
    return (React.createElement("span", { className: "avanzamento" },
        React.createElement("span", { className: "conteggio" },
            fatti,
            "/",
            totali),
        React.createElement("span", { className: "barra" },
            React.createElement("span", { style: { width: pct + "%", background: attivo ? "var(--segnale)" : "var(--testo-2)" } }))));
}
