// L'App intera in jsdom, con fetch finto: la scelta nell'indirizzo, un link, Indietro e Avanti, risposte in ritardo.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const richiedi = createRequire(import.meta.url);
// Si apre da un link al figlio mentre il browser ricorda un'altra scelta, la cui risposta arriva per ultima.
const { window } = new JSDOM('<!doctype html><meta name="forgia-committente" content="{{COMMITTENTE}}"><div id=radice></div>',
  { url: "http://x/cantiere/#/PRIV/cantiere/navigazione-dashboard/figlio", pretendToBeVisual: true });
window.localStorage.setItem("forgia-selezione", JSON.stringify({ tipo: "cantiere", id: 100 }));
window.localStorage.setItem("forgia-lingua", "it");
const RITARDI: Record<string, number> = { "cantieri/100": 200 };

const ORA = "2026-10-22T08:00:00Z";
const cantiere = (id: number, nome: string, stato: string, extra: object = {}) => ({
  id, progetto: "cantiere", nome, percorso: nome, padre_id: null, stato, origine: "repo", change: nome, descrizione: null,
  creato_il: ORA, aggiornato_il: ORA, artefatti: null, task: null, fasi: null, change_mancante: false, da_archiviare: false,
  file_idea: 0, domande_in_attesa: 0, domande: [], sessioni: [], ...extra,
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

async function fetchFinto(url: string) {
  const ritardo = Object.entries(RITARDI).find(([k]) => url.endsWith(k));
  if (ritardo) await new Promise((r) => setTimeout(r, ritardo[1]));
  const id = /cantieri\/(\d+)$/.exec(url)?.[1];
  const dati = url.includes("albero") ? { release: "26.10.10", committenti: ALBERO }
    : id ? { cantiere: CANTIERI.find((c) => c.id === Number(id)), turni: [], file: [], task_aperti: [], todo: [], esiti: [], discendenti_attivi: [] }
    : { sessioni: [] };
  return { ok: true, status: 200, json: async () => dati };
}

// L'aggiornamento ogni 30 s non deve tenere aperto il processo del test.
const intervallo = globalThis.setInterval;
globalThis.setInterval = ((f: () => void, ms: number) => intervallo(f, ms).unref()) as unknown as typeof setInterval;
const React = richiedi("react");
Object.assign(globalThis, {
  window, document: window.document, location: window.location, history: window.history, localStorage: window.localStorage,
  addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
  HTMLElement: window.HTMLElement, React, ReactDOM: { ...richiedi("react-dom/client"), createPortal: richiedi("react-dom").createPortal },
  markdownit: richiedi("markdown-it"), fetch: fetchFinto, IS_REACT_ACT_ENVIRONMENT: true,
});

const pausa = (ms: number) => React.act(() => new Promise((r) => setTimeout(r, ms)));
const $ = (sel: string) => window.document.querySelector<HTMLElement>(sel);
const titolo = () => $(".titolo-lavoro")?.textContent ?? null;
const hash = () => decodeURIComponent(window.location.hash);
async function clic(sel: string, testo = "") {
  const e = [...window.document.querySelectorAll<HTMLElement>(sel)].find((x) => x.textContent!.includes(testo));
  assert.ok(e, `manca ${sel} ${testo}`);
  await React.act(async () => e.click());
  await pausa(50);
}
const naviga = async (azione: () => void) => { await React.act(async () => azione()); await pausa(80); };

await React.act(async () => { await import(new URL("../ui/dist/app.js", import.meta.url).href); });
await pausa(400);

test("un link apre quella scelta anche se il browser ne ricorda un'altra, e una risposta in ritardo non la copre", () => {
  assert.equal(titolo(), "navigazione-dashboard/figlio");
  assert.equal(hash(), "#/PRIV/cantiere/navigazione-dashboard/figlio");
});

test("tre scelte aggiungono tre passi; tre Indietro le ripercorrono, Avanti torna avanti", async () => {
  const inizio = window.history.length;
  await clic("button.indietro");
  await clic(".voce", "mercurius");
  await clic('.filtri-livello [role="tab"]', "Aperti");
  await clic(".voce", "AI-Berkshire");
  await clic(".percorso button", "PRIV");
  assert.equal(window.history.length, inizio + 3);
  assert.equal(hash(), "#/PRIV");
  await naviga(() => window.history.back());
  assert.deepEqual([titolo(), hash()], ["AI-Berkshire", "#/PRIV/mercurius/AI-Berkshire"]);
  await naviga(() => window.history.back());
  assert.deepEqual([titolo(), hash()], ["mercurius", "#/PRIV/mercurius"]);
  await naviga(() => window.history.back());
  assert.deepEqual([titolo(), hash()], ["navigazione-dashboard/figlio", "#/PRIV/cantiere/navigazione-dashboard/figlio"]);
  await naviga(() => window.history.forward());
  assert.deepEqual([titolo(), hash()], ["mercurius", "#/PRIV/mercurius"]);
});

test("un indirizzo che non porta a niente torna quello della scelta", async () => {
  await naviga(() => (window.location.hash = "#/PRIV/nulla"));
  assert.deepEqual([titolo(), hash()], ["mercurius", "#/PRIV/mercurius"]);
});

test("lo stesso indirizzo scritto in un'altra codifica non aggiunge passi", async () => {
  await naviga(() => (window.location.hash = "#/PRIV/cantiere"));
  const prima = window.history.length;
  await naviga(() => (window.location.hash = "#/PRIV/%6Dercurius"));
  assert.equal(window.history.length, prima + 1, "solo il passo del browser");
  assert.deepEqual([titolo(), window.location.hash], ["mercurius", "#/PRIV/mercurius"]);
});
