import { T } from "../testi.js";
const BASE_PULSANTE = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: "1px solid transparent",
    borderRadius: "var(--r-2)", fontFamily: "var(--font-sans)", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    transition: "background var(--durata-1) var(--curva), border-color var(--durata-1) var(--curva)",
};
const MISURE = { sm: { height: 28, padding: "0 10px", fontSize: 13 }, md: { height: 36, padding: "0 14px", fontSize: 14 } };
export function Button({ variant = "primario", size = "md", disabled = false, children, onClick, type = "button", style, title, premuto }) {
    const [h, setH] = React.useState(false);
    const v = {
        primario: { background: h ? "var(--segnale-hover)" : "var(--segnale)", color: "var(--testo-su-segnale)" },
        secondario: { background: h ? "var(--superficie-alta)" : "transparent", color: "var(--testo)", borderColor: "var(--linea-forte)" },
        fantasma: { background: h ? "var(--superficie)" : "transparent", color: "var(--testo)" },
    }[variant];
    return (React.createElement("button", { type: type, disabled: disabled, onClick: onClick, title: title, "aria-label": title, "aria-pressed": premuto, onMouseEnter: () => setH(true), onMouseLeave: () => setH(false), style: { ...BASE_PULSANTE, ...MISURE[size], ...v, ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}), ...style } }, children));
}
/** Casella in sola lettura: i todo li scrive Claude, la dashboard li mostra soltanto. */
export function Checkbox({ checked, label }) {
    return (React.createElement("span", { style: { display: "inline-flex", alignItems: "flex-start", gap: 8, font: "var(--t-piccolo)", color: "var(--testo)" } },
        React.createElement("span", { role: "img", "aria-label": checked ? T.fatto : T.daFare, style: {
                width: 16, height: 16, flex: "none", marginTop: 1, borderRadius: "var(--r-1)", display: "flex", alignItems: "center",
                justifyContent: "center", background: checked ? "var(--segnale)" : "transparent",
                border: "1px solid " + (checked ? "var(--segnale)" : "var(--linea-forte)"),
            } }, checked && React.createElement("svg", { viewBox: "0 0 16 16", width: "12", height: "12", "aria-hidden": "true" },
            React.createElement("path", { d: "M3 8.5L6.5 12L13 4.5", fill: "none", stroke: "var(--testo-su-segnale)", strokeWidth: "2" }))),
        React.createElement("span", { style: { minWidth: 0 } }, label)));
}
export function Tabs({ items, value, onChange }) {
    return (React.createElement("div", { role: "tablist", style: { display: "flex", flexWrap: "wrap", columnGap: 20, borderBottom: "1px solid var(--linea)" } }, items.map((it) => {
        const a = it.id === value;
        return (React.createElement("button", { key: it.id, role: "tab", "aria-selected": a, onClick: () => onChange(it.id), style: {
                display: "flex", alignItems: "center", gap: 6, height: 36, padding: 0, marginBottom: -1, background: "none", border: 0,
                borderBottom: "2px solid " + (a ? "var(--segnale)" : "transparent"), cursor: "pointer", font: "var(--t-piccolo)",
                fontWeight: a ? 600 : 400, color: a ? "var(--testo)" : "var(--testo-2)", whiteSpace: "nowrap",
            } },
            it.label,
            it.count != null && React.createElement("span", { style: { font: "400 11px/1 var(--font-mono)", color: "var(--testo-2)" } }, it.count)));
    })));
}
export function Input({ label, hint, error, value, onChange, placeholder, mono = false, multilinea = false, autoFocus = false }) {
    const [f, setF] = React.useState(false);
    const bordo = error ? "var(--errore)" : f ? "var(--focus)" : "var(--linea-forte)";
    const campo = {
        flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "var(--carta-50)",
        font: mono ? "var(--t-codice)" : "var(--t-corpo)", fontSize: 14, resize: "vertical",
    };
    const comune = { value, placeholder, autoFocus, onFocus: () => setF(true), onBlur: () => setF(false) };
    return (React.createElement("label", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        React.createElement("span", { style: { font: "var(--t-etichetta)", letterSpacing: "var(--t-etichetta-spaziatura)", textTransform: "uppercase", color: "var(--testo-2)" } }, label),
        React.createElement("span", { style: { display: "flex", alignItems: multilinea ? "stretch" : "center", minHeight: 36, padding: multilinea ? "8px 10px" : "0 10px", background: "var(--sfondo-profondo)", border: "1px solid " + bordo, borderRadius: "var(--r-2)" } }, multilinea
            ? React.createElement("textarea", { ...comune, rows: 3, onChange: (e) => onChange(e.target.value), style: campo })
            : React.createElement("input", { ...comune, onChange: (e) => onChange(e.target.value), style: campo })),
        (error || hint) && React.createElement("span", { style: { font: "var(--t-piccolo)", color: error ? "var(--errore)" : "var(--testo-2)" } }, error || hint)));
}
