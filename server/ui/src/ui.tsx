// Pezzi piccoli usati da più viste.
import type { ReactNode } from "react";

export function Etichetta({ children }: { children: ReactNode }) {
  return <span className="etichetta">{children}</span>;
}

/** Coppie nome · valore in colonna, come la scheda tecnica del prototipo. */
export function Campi({ righe }: { righe: [string, ReactNode][] }) {
  return (
    <dl className="campi">
      {righe.map(([k, v]) => (
        <React.Fragment key={k}><dt>{k}</dt><dd>{v ?? "—"}</dd></React.Fragment>
      ))}
    </dl>
  );
}

export function Avviso({ children }: { children: ReactNode }) {
  return <div className="avviso">{children}</div>;
}

export function Vuoto({ children }: { children: ReactNode }) {
  return <p className="vuoto">{children}</p>;
}

/** Conteggio asciutto (7/12) con la barra sottile del design system. */
export function Avanzamento({ fatti, totali, attivo = true }: { fatti: number; totali: number; attivo?: boolean }) {
  const pct = totali ? Math.round((fatti / totali) * 100) : 0;
  return (
    <span className="avanzamento">
      <span className="conteggio">{fatti}/{totali}</span>
      <span className="barra"><span style={{ width: pct + "%", background: attivo ? "var(--segnale)" : "var(--testo-2)" }} /></span>
    </span>
  );
}
