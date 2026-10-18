// Dal design system forgia (components/feedback): StatoBadge, Toast, Dialog.
import type { CSSProperties, ReactNode } from "react";
import type { Stato, StatoSessione } from "../api.ts";
import { T } from "../testi.ts";

// Gli stati si distinguono per forma, non per colore. L'idea, che il design system non ha, è un rombo vuoto.
const FORMA: Record<Stato, CSSProperties> = {
  idea: { border: "2px solid var(--segnale)", borderRadius: 1, transform: "rotate(45deg) scale(.8)" },
  aperto: { background: "var(--stato-in-corso)", borderRadius: "50%" },
  completato: { background: "var(--stato-completato)", borderRadius: "50%" },
  sospeso: { border: "2px solid var(--stato-sospeso)", borderRadius: "50%" },
  abbandonato: { border: "2px dashed var(--stato-abbandonato)", borderRadius: "50%" },
};

// Una sessione prende la forma dello stato più vicino: piena se lavora, vuota se ha finito il turno.
const FORMA_SESSIONE: Record<StatoSessione, Stato> = { lavorando: "aperto", attiva: "sospeso", in_attesa: "sospeso", inattiva: "abbandonato", chiusa: "completato" };

function Badge({ forma, testo, etichetta }: { forma: CSSProperties; testo: string; etichetta: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "var(--t-piccolo)", color: "var(--testo)", whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, flex: "none", boxSizing: "border-box", ...forma }} />
      {etichetta ? testo : <span className="solo-lettori">{testo}</span>}
    </span>
  );
}

export function StatoBadge({ stato, etichetta = true }: { stato: Stato; etichetta?: boolean }) {
  return <Badge forma={FORMA[stato]} testo={T.stato[stato]} etichetta={etichetta} />;
}

export function SessioneBadge({ stato }: { stato: StatoSessione }) {
  return <Badge forma={FORMA[FORMA_SESSIONE[stato]]} testo={T.statoSessione[stato]} etichetta />;
}

export function Toast({ tono = "info", titolo, children, onChiudi }: {
  tono?: "info" | "errore"; titolo: string; children?: ReactNode; onChiudi: () => void;
}) {
  return (
    <div role="status" style={{ width: 360, maxWidth: "100%", background: "var(--sfondo-profondo)", color: "var(--carta-50)", border: "1px solid " + (tono === "errore" ? "var(--errore)" : "var(--linea-forte)"), borderRadius: "var(--r-2)" }}>
      <div style={{ display: "flex", gap: 12, padding: "12px 14px", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ font: "var(--t-h3)", fontSize: 14 }}>{titolo}</span>
          {children && <span style={{ font: "var(--t-piccolo)", color: "var(--prussia-300)" }}>{children}</span>}
        </div>
        <button onClick={onChiudi} aria-label={T.chiudi} style={{ background: "none", border: 0, color: "var(--prussia-300)", font: "400 16px/1 var(--font-mono)", cursor: "pointer", padding: 2 }}>×</button>
      </div>
    </div>
  );
}

export function Dialog({ titolo, children, azioni, onChiudi, soloPulsanti = false }: {
  titolo: string; children: ReactNode; azioni: ReactNode; onChiudi: () => void; soloPulsanti?: boolean;
}) {
  React.useEffect(() => {
    if (soloPulsanti) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onChiudi();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onChiudi, soloPulsanti]);
  return (
    <div onClick={(e) => !soloPulsanti && e.target === e.currentTarget && onChiudi()} style={{ position: "fixed", inset: 0, background: "rgba(14,32,65,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }}>
      <div role="dialog" aria-modal="true" aria-label={titolo} style={{ width: 480, maxWidth: "100%", maxHeight: "100%", overflowY: "auto", background: "var(--superficie)", color: "var(--testo)", border: "1px solid var(--linea-forte)", borderRadius: "var(--r-3)", boxShadow: "var(--ombra-dialogo)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 20px 0", font: "var(--t-h2)", fontSize: 18 }}>{titolo}</div>
        <div style={{ padding: "10px 20px 18px", font: "var(--t-corpo)", fontSize: 14, color: "var(--testo-2)", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--linea)" }}>{azioni}</div>
      </div>
    </div>
  );
}
