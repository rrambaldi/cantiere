// L'App intera in jsdom, con fetch finto e un albero piccolo: per i test che la usano come un browser.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const richiedi = createRequire(import.meta.url);

const ORA = "2026-10-22T08:00:00Z";
const cantiere = (id: number, nome: string, stato: string, extra: object = {}) => ({
  id, progetto: "cantiere", nome, percorso: nome, padre_id: null, stato, origine: "repo", change: nome, descrizione: null,
  creato_il: ORA, aggiornato_il: ORA, artefatti: null, task: null, fasi: null, change_mancante: false, da_archiviare: false,
  file_idea: 0, domande_in_attesa: 0, domande: [], sessioni: [], nato_da: [], ...extra,
});
const progetto = (id: number, nome: string, cantieri: ReturnType<typeof cantiere>[]) =>
  ({ id, nome, slug: nome, creato_il: ORA, non_censite: 0, domande_in_attesa: 0, cantieri });
const ALBERO = [{
  id: 1, nome: "PRIV", creato_il: ORA, token_il: ORA, progetti: [
    progetto(10, "cantiere", [
      cantiere(100, "navigazione-dashboard", "aperto"),
      cantiere(103, "figlio", "idea", { percorso: "navigazione-dashboard/figlio", padre_id: 100 }),
    ]),
    progetto(11, "mercurius", [cantiere(110, "AI-Berkshire", "aperto")]),
  ],
}];
const CANTIERI = ALBERO.flatMap((cm) => cm.progetti.flatMap((p) => p.cantieri));

/**
 * Monta l'App all'indirizzo dato, con quel che il browser ricorda e le risposte da ritardare (per fine dell'URL, in ms).
 * `telefono` dice se la pagina è stretta come un telefono (la media query di app.tsx); `cambiaLarghezza` la stringe o allarga.
 * `nonCensite` sono le sessioni senza cantiere di ogni progetto.
 */
export async function montaApp({ url, ricordati = {}, ritardi = {}, telefono = false, nonCensite = [] }: {
  url: string; ricordati?: Record<string, unknown>; ritardi?: Record<string, number>; telefono?: boolean; nonCensite?: object[];
}) {
  const { window } = new JSDOM('<!doctype html><meta name="forgia-committente" content="{{COMMITTENTE}}"><div id=radice></div>',
    { url, pretendToBeVisual: true });
  window.localStorage.setItem("forgia-lingua", "it");
  for (const [k, v] of Object.entries(ricordati)) window.localStorage.setItem(k, JSON.stringify(v));

  async function fetchFinto(u: string) {
    const ritardo = Object.entries(ritardi).find(([k]) => u.endsWith(k));
    if (ritardo) await new Promise((r) => setTimeout(r, ritardo[1]));
    const id = /cantieri\/(\d+)$/.exec(u)?.[1];
    const dati = u.includes("albero") ? { release: "26.10.10", committenti: ALBERO }
      : id ? { cantiere: CANTIERI.find((c) => c.id === Number(id)), turni: [], file: [], task_aperti: [], todo: [], esiti: [], discendenti_attivi: [] }
      : { sessioni: nonCensite };
    return { ok: true, status: 200, json: async () => dati };
  }

  // L'aggiornamento ogni 30 s non deve tenere aperto il processo del test.
  const intervallo = globalThis.setInterval;
  globalThis.setInterval = ((f: () => void, ms: number) => intervallo(f, ms).unref()) as unknown as typeof setInterval;
  const media = Object.assign(new window.EventTarget(), { matches: telefono });
  Object.assign(globalThis, {
    window, document: window.document, location: window.location, history: window.history, localStorage: window.localStorage,
    addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
    matchMedia: () => media, HTMLElement: window.HTMLElement, fetch: fetchFinto, IS_REACT_ACT_ENVIRONMENT: true,
    // jsdom non misura: i binari restano alla larghezza minima.
    ResizeObserver: class { observe() {} disconnect() {} },
  });
  // react-dom guarda all'avvio se c'è un DOM: caricato prima, usa i ripieghi dei vecchi browser e si rompe sui campi di testo.
  const React = richiedi("react");
  Object.assign(globalThis, {
    React, ReactDOM: { ...richiedi("react-dom/client"), createPortal: richiedi("react-dom").createPortal }, markdownit: richiedi("markdown-it"),
  });

  const pausa = (ms: number) => React.act(() => new Promise((r) => setTimeout(r, ms)));
  const $ = (sel: string) => window.document.querySelector<HTMLElement>(sel);
  async function clic(sel: string, testo = "") {
    const e = [...window.document.querySelectorAll<HTMLElement>(sel)].find((x) => x.textContent!.includes(testo));
    assert.ok(e, `manca ${sel} ${testo}`);
    await React.act(async () => e.click());
    await pausa(50);
  }
  const naviga = async (azione: () => void) => { await React.act(async () => azione()); await pausa(80); };

  await React.act(async () => { await import(new URL("../ui/dist/app.js", import.meta.url).href); });
  await pausa(400);
  return {
    window, $, clic, naviga, pausa,
    cambiaLarghezza: (stretta: boolean) => naviga(() => { media.matches = stretta; media.dispatchEvent(new window.Event("change")); }),
    titolo: () => $(".titolo-lavoro")?.textContent ?? null,
    hash: () => decodeURIComponent(window.location.hash),
  };
}
