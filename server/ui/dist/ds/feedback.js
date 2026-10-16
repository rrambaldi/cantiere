import { T } from "../testi.js";
// Gli stati si distinguono per forma, non per colore. L'idea, che il design system non ha, è un rombo vuoto.
const FORMA = {
    idea: { border: "2px solid var(--segnale)", borderRadius: 1, transform: "rotate(45deg) scale(.8)" },
    aperto: { background: "var(--stato-in-corso)", borderRadius: "50%" },
    completato: { background: "var(--stato-completato)", borderRadius: "50%" },
    sospeso: { border: "2px solid var(--stato-sospeso)", borderRadius: "50%" },
    abbandonato: { border: "2px dashed var(--stato-abbandonato)", borderRadius: "50%" },
};
export function StatoBadge({ stato, etichetta = true }) {
    return (React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, font: "var(--t-piccolo)", color: "var(--testo)", whiteSpace: "nowrap" } },
        React.createElement("span", { "aria-hidden": "true", style: { width: 10, height: 10, flex: "none", boxSizing: "border-box", ...FORMA[stato] } }),
        etichetta ? T.stato[stato] : React.createElement("span", { className: "solo-lettori" }, T.stato[stato])));
}
export function Toast({ tono = "info", titolo, children, onChiudi }) {
    return (React.createElement("div", { role: "status", style: { width: 360, maxWidth: "100%", background: "var(--sfondo-profondo)", color: "var(--carta-50)", border: "1px solid " + (tono === "errore" ? "var(--errore)" : "var(--linea-forte)"), borderRadius: "var(--r-2)" } },
        React.createElement("div", { style: { display: "flex", gap: 12, padding: "12px 14px", alignItems: "flex-start" } },
            React.createElement("div", { style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 } },
                React.createElement("span", { style: { font: "var(--t-h3)", fontSize: 14 } }, titolo),
                children && React.createElement("span", { style: { font: "var(--t-piccolo)", color: "var(--prussia-300)" } }, children)),
            React.createElement("button", { onClick: onChiudi, "aria-label": T.chiudi, style: { background: "none", border: 0, color: "var(--prussia-300)", font: "400 16px/1 var(--font-mono)", cursor: "pointer", padding: 2 } }, "\u00D7"))));
}
export function Dialog({ titolo, children, azioni, onChiudi, soloPulsanti = false }) {
    React.useEffect(() => {
        if (soloPulsanti)
            return;
        const esc = (e) => e.key === "Escape" && onChiudi();
        document.addEventListener("keydown", esc);
        return () => document.removeEventListener("keydown", esc);
    }, [onChiudi, soloPulsanti]);
    return (React.createElement("div", { onClick: (e) => !soloPulsanti && e.target === e.currentTarget && onChiudi(), style: { position: "fixed", inset: 0, background: "rgba(14,32,65,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 } },
        React.createElement("div", { role: "dialog", "aria-modal": "true", "aria-label": titolo, style: { width: 480, maxWidth: "100%", maxHeight: "100%", overflowY: "auto", background: "var(--superficie)", color: "var(--testo)", border: "1px solid var(--linea-forte)", borderRadius: "var(--r-3)", boxShadow: "var(--ombra-dialogo)", display: "flex", flexDirection: "column" } },
            React.createElement("div", { style: { padding: "18px 20px 0", font: "var(--t-h2)", fontSize: 18 } }, titolo),
            React.createElement("div", { style: { padding: "10px 20px 18px", font: "var(--t-corpo)", fontSize: 14, color: "var(--testo-2)", display: "flex", flexDirection: "column", gap: 12 } }, children),
            React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--linea)" } }, azioni))));
}
