// Pezzi piccoli usati da più viste.
import type { ReactNode } from "react";
import { Button } from "./ds/core.tsx";
import { T } from "./testi.ts";

// Icone di Lucide ridisegnate qui: la pagina non carica script da CDN.
// Lucide, ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of
// Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
// Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is
// hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE
// INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE,
// DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
// CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
const ICONE = {
  copia: ["M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"],
  scarica: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  modifica: ["M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z", "m15 5 4 4"],
  cestino: ["M3 6h18", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", "M10 11v6", "M14 11v6"],
  fatto: ["M20 6 9 17l-5-5"],
  chiudi: ["M18 6 6 18", "m6 6 12 12"],
  // Barra dell'editor Markdown
  grassetto: ["M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"],
  corsivo: ["M19 4h-9", "M14 20H5", "M15 4 9 20"],
  titolo: ["M6 12h12", "M6 20V4", "M18 20V4"],
  elenco: ["M3 12h.01", "M3 18h.01", "M3 6h.01", "M8 12h13", "M8 18h13", "M8 6h13"],
  elencoNumerato: ["M10 12h11", "M10 18h11", "M10 6h11", "M4 10h2", "M4 6h1v4", "M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"],
  caselle: ["m3 17 2 2 4-4", "m3 7 2 2 4-4", "M13 6h8", "M13 12h8", "M13 18h8"],
  citazione: ["M17 6H3", "M21 12H8", "M21 18H8", "M3 12v6"],
  codice: ["m16 18 6-6-6-6", "m8 6-6 6 6 6"],
  collegamento: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  anteprima: ["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
  affiancato: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M12 3v18"],
};
export type NomeIcona = keyof typeof ICONE;

/** Icona da 16 px, tratto 1,5 in currentColor, come chiede il design system. */
export function Icona({ nome }: { nome: NomeIcona }) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONE[nome].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** Pulsante con la sola icona: il testo diventa tooltip e nome accessibile. */
export function BottoneIcona({ icona, titolo, onClick, disabled = false }: { icona: NomeIcona; titolo: string; onClick: () => void; disabled?: boolean }) {
  return <Button variant="fantasma" size="sm" title={titolo} onClick={onClick} disabled={disabled} style={{ width: 28, padding: 0 }}><Icona nome={icona} /></Button>;
}

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

/** Pallino rosso delle domande in attesa; il numero compare solo se sono più di una. */
export function Pallino({ n }: { n: number }) {
  if (n <= 0) return null;
  const testo = T.domandeInAttesaN(n);
  return <span className="pallino" role="img" aria-label={testo} title={testo}>{n > 1 ? n : null}</span>;
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
