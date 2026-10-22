// Dal design system forgia (components/core): Button, Checkbox, Tabs, Input.
import type { CSSProperties, ReactNode } from "react";
import { T } from "../testi.ts";

const BASE_PULSANTE: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: "1px solid transparent",
  borderRadius: "var(--r-2)", fontFamily: "var(--font-sans)", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  transition: "background var(--durata-1) var(--curva), border-color var(--durata-1) var(--curva)",
};
const MISURE = { sm: { height: 28, padding: "0 10px", fontSize: 13 }, md: { height: 36, padding: "0 14px", fontSize: 14 } };

export function Button({ variant = "primario", size = "md", disabled = false, children, onClick, type = "button", style, title, premuto }: {
  variant?: "primario" | "secondario" | "fantasma"; size?: "sm" | "md"; disabled?: boolean; children: ReactNode;
  onClick?: () => void; type?: "button" | "submit"; style?: CSSProperties;
  /** Tooltip e nome accessibile, per i pulsanti con la sola icona. */
  title?: string;
  /** Solo per gli interruttori: acceso o spento. */
  premuto?: boolean;
}) {
  const [h, setH] = React.useState(false);
  const v = {
    primario: { background: h ? "var(--segnale-hover)" : "var(--segnale)", color: "var(--testo-su-segnale)" },
    secondario: { background: h ? "var(--superficie-alta)" : "transparent", color: "var(--testo)", borderColor: "var(--linea-forte)" },
    fantasma: { background: h ? "var(--superficie)" : "transparent", color: "var(--testo)" },
  }[variant];
  return (
    <button type={type} disabled={disabled} onClick={onClick} title={title} aria-label={title} aria-pressed={premuto} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ ...BASE_PULSANTE, ...MISURE[size], ...v, ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}), ...style }}>
      {children}
    </button>
  );
}

/** Casella in sola lettura: i todo li scrive Claude, la dashboard li mostra soltanto. */
export function Checkbox({ checked, label }: { checked: boolean; label: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, font: "var(--t-piccolo)", color: "var(--testo)" }}>
      <span role="img" aria-label={checked ? T.fatto : T.daFare} style={{
        width: 16, height: 16, flex: "none", marginTop: 1, borderRadius: "var(--r-1)", display: "flex", alignItems: "center",
        justifyContent: "center", background: checked ? "var(--segnale)" : "transparent",
        border: "1px solid " + (checked ? "var(--segnale)" : "var(--linea-forte)"),
      }}>
        {checked && <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke="var(--testo-su-segnale)" strokeWidth="2" /></svg>}
      </span>
      <span style={{ minWidth: 0 }}>{label}</span>
    </span>
  );
}

export function Tabs<T extends string>({ items, value, onChange }: {
  items: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" style={{ display: "flex", flexWrap: "wrap", columnGap: 20, borderBottom: "1px solid var(--linea)" }}>
      {items.map((it) => {
        const a = it.id === value;
        return (
          <button key={it.id} role="tab" aria-selected={a} onClick={() => onChange(it.id)} style={{
            display: "flex", alignItems: "center", gap: 6, height: 36, padding: 0, marginBottom: -1, background: "none", border: 0,
            borderBottom: "2px solid " + (a ? "var(--segnale)" : "transparent"), cursor: "pointer", font: "var(--t-piccolo)",
            fontWeight: a ? 600 : 400, color: a ? "var(--testo)" : "var(--testo-2)", whiteSpace: "nowrap",
          }}>
            {it.label}
            {it.count != null && <span style={{ font: "400 11px/1 var(--font-mono)", color: "var(--testo-2)" }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Input({ label, hint, error, value, onChange, placeholder, mono = false, multilinea = false, autoFocus = false }: {
  label: string; hint?: string; error?: string; value: string; onChange: (valore: string) => void; placeholder?: string;
  mono?: boolean; multilinea?: boolean; autoFocus?: boolean;
}) {
  const [f, setF] = React.useState(false);
  const bordo = error ? "var(--errore)" : f ? "var(--focus)" : "var(--linea-forte)";
  const campo: CSSProperties = {
    flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "var(--carta-50)",
    font: mono ? "var(--t-codice)" : "var(--t-corpo)", fontSize: 14, resize: "vertical",
  };
  const comune = { value, placeholder, autoFocus, onFocus: () => setF(true), onBlur: () => setF(false) };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ font: "var(--t-etichetta)", letterSpacing: "var(--t-etichetta-spaziatura)", textTransform: "uppercase", color: "var(--testo-2)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: multilinea ? "stretch" : "center", minHeight: 36, padding: multilinea ? "8px 10px" : "0 10px", background: "var(--sfondo-profondo)", border: "1px solid " + bordo, borderRadius: "var(--r-2)" }}>
        {multilinea
          ? <textarea {...comune} rows={3} onChange={(e) => onChange(e.target.value)} style={campo} />
          : <input {...comune} onChange={(e) => onChange(e.target.value)} style={campo} />}
      </span>
      {(error || hint) && <span style={{ font: "var(--t-piccolo)", color: error ? "var(--errore)" : "var(--testo-2)" }}>{error || hint}</span>}
    </label>
  );
}
