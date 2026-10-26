// Scheda «Binari» del committente: intervalli dei cantieri, corsie per progetto con i rami sotto la partenza e i
// monconi verso altri progetti, e il disegno con fermi, sessioni e indirizzi dei cantieri.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const richiedi = createRequire(import.meta.url);
const { window } = new JSDOM("<!doctype html><div id=radice></div>");
Object.assign(globalThis, { markdownit: richiedi("markdown-it"), React: richiedi("react"), window, document: window.document });
const { renderToStaticMarkup } = richiedi("react-dom/server");
const React = richiedi("react");
const dist = (nome: string) => import(new URL(`../ui/dist/${nome}`, import.meta.url).href);
const { impostaLingua } = await dist("testi.js");
const { Binari, disponi, intervallo } = await dist("binari.js");
impostaLingua("it");

const ORA = Date.parse("2026-10-26T20:56:00Z");
const ore = (h: number) => new Date(ORA - h * 3_600_000).toISOString();
const cantiere = (id: number, progetto: string, percorso: string, extra: object = {}) => ({
  id, progetto, nome: percorso, percorso, padre_id: null, stato: "aperto", origine: "utente", change: percorso, descrizione: null,
  creato_il: ore(100), aggiornato_il: ore(10), stato_il: ore(100), artefatti: null, task: null, fasi: null, change_mancante: false,
  da_archiviare: false, file_idea: 0, domande_in_attesa: 0, domande: [], sessioni: [], nato_da: [], ...extra,
});
const legame = (id: number, progetto: string, percorso: string, task: string | null = null, tipo = "registrato") => ({ id, progetto, percorso, task, tipo });
const progetto = (id: number, nome: string, cantieri: object[], extra: object = {}) =>
  ({ id, nome, slug: nome, creato_il: ore(500), non_censite: 0, domande_in_attesa: 0, cantieri, ...extra });

const multi = cantiere(3, "parity-deriva", "multi-instrument-simulations", { creato_il: ore(264), aggiornato_il: ore(147), task: { fatti: 0, totali: 13 } });
const basket = cantiere(45, "parity-deriva", "basket-mix", { creato_il: ore(152), aggiornato_il: ore(147), nato_da: [legame(3, "parity-deriva", "multi-instrument-simulations", "1.1", "citato")] });
const replay = cantiere(62, "parity-deriva", "replay-barra-per-barra", { creato_il: ore(1), aggiornato_il: ore(0.2), sessioni: [{ session_id: "s1", host: "mine", branch: "dev", stato: "lavorando", titolo: null, fatto: null, prossimo: null, eta_secondi: 5, subagenti: {} }] });
const chiuso = cantiere(41, "parity-deriva", "indicatori", { stato: "completato", creato_il: ore(155), aggiornato_il: ore(131), stato_il: "2026-10-21" });
const info = cantiere(49, "mercurius", "info-extra-per-stocks", { stato: "idea", origine: "dashboard", creato_il: ore(144), nato_da: [legame(3, "parity-deriva", "multi-instrument-simulations")] });
const presa = cantiere(9, "NIS2", "SALVATAGGIO CONFIGURAZIONI", { origine: "dashboard", creato_il: ore(252), stato_il: ore(106), aggiornato_il: ore(9) });
const PRIV = { id: 1, nome: "PRIV", creato_il: ore(500), token_il: ore(500), progetti: [
  progetto(2, "parity-deriva", [multi, basket, replay, chiuso]),
  progetto(3, "mercurius", [info], { non_censite: 4 }),
  progetto(5, "NIS2", [presa]),
  progetto(7, "PS", []),
] };

test("binari: un'idea presa più tardi parte dalla presa; un completato finisce all'ultimo aggiornamento", () => {
  const p = intervallo(presa, ORA);
  assert.deepEqual([p.presa, p.inizio, p.fine], [Date.parse(presa.stato_il), Date.parse(presa.stato_il), ORA]);
  assert.equal(intervallo(multi, ORA).presa, null);
  assert.equal(intervallo(chiuso, ORA).fine, Date.parse(chiuso.aggiornato_il));
  // Per un completato `stato_il` è il giorno dell'archivio, non la presa.
  assert.equal(intervallo({ ...chiuso, origine: "dashboard" }, ORA).presa, null);
});

test("binari: corsie dalla più recente, ramo sotto la partenza, moncone verso l'altro progetto, progetti senza binari a parte", () => {
  const { corsie, senza } = disponi(PRIV, ORA, 12);
  assert.deepEqual(corsie.map((k: any) => k.p.nome), ["parity-deriva", "NIS2"]);
  const righe = corsie[0].righe.map((r: any) => [r.tipo, r.c.percorso, r.tipo === "cantiere" ? r.livello : r.da.percorso]);
  assert.deepEqual(righe, [
    ["cantiere", "replay-barra-per-barra", 0],
    ["cantiere", "indicatori", 0],
    ["cantiere", "multi-instrument-simulations", 0],
    ["moncone", "info-extra-per-stocks", "multi-instrument-simulations"],
    ["cantiere", "basket-mix", 1],
  ]);
  assert.deepEqual(senza.map((p: any) => p.nome), ["mercurius", "PS"]);
  assert.equal(disponi(PRIV, ORA, 30).corsie.find((k: any) => k.p.nome === "parity-deriva").ricevuti, 0);
});

test("binari: una fase sta sotto il padre col solo nome, con il tratto dal suo binario", () => {
  const manuali = cantiere(42, "digithera", "manuali installazione", { creato_il: ore(154), aggiornato_il: ore(154) });
  const mn02 = cantiere(43, "digithera", "manuali installazione/mn02", { nome: "mn02", padre_id: 42, creato_il: ore(154), aggiornato_il: ore(108) });
  const cm = { ...PRIV, nome: "DGT", progetti: [progetto(11, "digithera", [mn02, manuali])] };
  assert.deepEqual(disponi(cm, ORA, 12).corsie[0].righe.map((r: any) => [r.c.nome, r.livello, r.padre?.fase ?? null]), [["manuali installazione", 0, null], ["mn02", 1, true]]);
  assert.match(renderToStaticMarkup(React.createElement(Binari, { cm, ora: ORA })), />↳ mn02</);
});

test("binari al telefono: il quadro ad albero con i rami rientrati, fermi, sessioni e i progetti senza binari", () => {
  const html = renderToStaticMarkup(React.createElement(Binari, { cm: PRIV, ora: ORA }));
  const quadro = html.slice(html.indexOf('class="quadro-binari"'), html.indexOf('class="scorre-binari"'));
  assert.match(quadro, /<h3>parity-deriva <span class="secondario">3 in corso · 0 idee · 1 completati<\/span><\/h3>/);
  assert.match(quadro, /class="livello-1"><a href="#\/PRIV\/parity-deriva\/basket-mix"><span class="nome"><span aria-hidden="true">└─ <\/span>basket-mix/);
  assert.match(quadro, /href="#\/PRIV\/mercurius\/info-extra-per-stocks"[^]*?mercurius \/ info-extra-per-stocks/);
  assert.match(quadro, /multi-instrument-simulations[^]*?0\/13[^]*?class="fermo">fermo 6 g/);
  assert.match(quadro, /class="lavora">mine · al lavoro/);
  assert.match(quadro, /senza binari: mercurius, PS/);
});

test("binari: un giro di legami non fa ripetere né perdere cantieri", () => {
  const a = cantiere(1, "x", "a", { nato_da: [legame(2, "x", "b")] });
  const b = cantiere(2, "x", "b", { nato_da: [legame(1, "x", "a")] });
  const { corsie } = disponi({ ...PRIV, progetti: [progetto(9, "x", [a, b])] }, ORA, 12);
  assert.deepEqual(corsie[0].righe.map((r: any) => r.c.percorso).sort(), ["a", "b"]);
});

test("binari: disegno con fermi, sessione al lavoro, indirizzi dei cantieri e scelte della finestra", () => {
  const html = renderToStaticMarkup(React.createElement(Binari, { cm: PRIV, ora: ORA }));
  assert.match(html, /aria-pressed="true"[^>]*>12 giorni/);
  assert.match(html, />fermo 6 g</);
  assert.match(html, /href="#\/PRIV\/parity-deriva\/basket-mix"/);
  assert.match(html, />mine · /);
  assert.match(html, />↳ ramo in mercurius</);
  assert.match(html, /senza binari: mercurius, PS/);
  assert.doesNotMatch(html, /replay-barra-per-barra, in corso, fermo/);
});
