// Colonna di navigazione a livelli e percorso sopra il titolo, con i click veri in jsdom.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const richiedi = createRequire(import.meta.url);
const { window } = new JSDOM("<!doctype html><div id=radice></div>");
// Nel browser arrivano come script UMD da /ui/vendor/. window e document servono a react-dom/client, prima di caricarlo.
Object.assign(globalThis, { React: richiedi("react"), window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = richiedi("react-dom/client");
const React = richiedi("react");
const dist = (nome: string) => import(new URL(`../ui/dist/${nome}`, import.meta.url).href);
const { impostaLingua } = await dist("testi.js");
const { hashDi, Indice, Percorso, posizioneDi, segmentiDi, selezioneDaHash } = await dist("indice.js");
impostaLingua("it");

const ORA = "2026-10-22T08:00:00Z";
const cantiere = (id: number, nome: string, stato: string, extra: object = {}) => ({
  id, progetto: "cantiere", nome, percorso: nome, padre_id: null, stato, origine: "repo", change: nome, descrizione: null,
  creato_il: ORA, aggiornato_il: ORA, artefatti: null, task: null, fasi: null, change_mancante: false, da_archiviare: false,
  file_idea: 0, domande_in_attesa: 0, domande: [], sessioni: [], nato_da: [], ...extra,
});
const progetto = (id: number, nome: string, cantieri: object[], extra: object = {}) =>
  ({ id, nome, slug: nome, creato_il: ORA, non_censite: 0, domande_in_attesa: 0, cantieri, ...extra });
// Due progetti con cantieri, così i conteggi dei filtri sono del progetto e non di tutto l'albero; in mercurius due domande in attesa.
const ALBERO = [{
  id: 1, nome: "PRIV", creato_il: ORA, token_il: ORA, progetti: [
    progetto(10, "cantiere", [
      cantiere(100, "navigazione-dashboard", "aperto", { task: { fatti: 0, totali: 3 } }),
      cantiere(101, "avvisi telegram", "idea"),
      cantiere(102, "forgia-v2", "completato"),
      cantiere(103, "figlio", "idea", { percorso: "navigazione-dashboard/figlio", padre_id: 100 }),
    ]),
    progetto(11, "mercurius", [cantiere(110, "AI-Berkshire", "idea", { domande_in_attesa: 2 })], { domande_in_attesa: 2 }),
  ],
}];

// Niente elementi jsdom dentro assert.equal: se fallisce, stampandoli il processo si pianta.
const $ = (sel: string) => window.document.querySelector<HTMLElement>(sel);
const testi = (sel: string) => [...window.document.querySelectorAll(sel)].map((e) => e.textContent);
const clic = (sel: string) => React.act(async () => $(sel)!.click());

/** Monta l'indice con le props date; registra le chiamate a onScegli, onPosizione e onColonne. */
async function monta(props: object) {
  const chiamate: { scegli: unknown[]; posizione: unknown[]; colonne: unknown[] } = { scegli: [], posizione: [], colonne: [] };
  const radice = createRoot($("#radice"));
  const base = {
    committenti: ALBERO, selezione: { tipo: "cantiere", id: 100 }, vista: "aperti", onVista: () => {},
    posizione: { livello: "cantieri", cm: 1, p: 10 }, colonne: { colonna: true, fissata: false, scheda: true },
    ristretta: false, onNuovoCommittente: () => {}, aggiornato: null, release: "26.10.10", errore: null, onLingua: () => {},
    onScegli: (s: unknown) => chiamate.scegli.push(s), onPosizione: (p: unknown) => chiamate.posizione.push(p),
    onColonne: (c: unknown) => chiamate.colonne.push(c),
  };
  const mostra = (altre: object) => React.act(async () => radice.render(React.createElement(Indice, { ...base, ...props, ...altre })));
  await mostra({});
  return { chiamate, mostra, smonta: () => React.act(async () => radice.unmount()) };
}

test("livello cantieri: filtri con i conteggi del progetto, avanzamento, «‹» con le domande rimaste fuori", async () => {
  const { chiamate, smonta } = await monta({});
  assert.match($(".livello-titolo")!.textContent!, /^cantiere4$/);
  assert.deepEqual(testi('[role="tab"]'), ["Aperti1", "Idee2", "Chiusi1"]);
  assert.deepEqual(testi(".nome-cantiere"), ["navigazione-dashboard"]);
  assert.match($(".voce.attiva")!.textContent!, /0\/3/);
  assert.equal($("button.indietro .pallino")!.getAttribute("aria-label"), "2 domande in attesa di risposta");
  await clic('button[aria-label="Torna ai progetti di PRIV"]');
  assert.deepEqual(chiamate.posizione, [{ livello: "progetti", cm: 1 }]);
  await smonta();
});

test("un figlio con il padre in un altro filtro mostra il percorso intero", async () => {
  const { smonta } = await monta({ vista: "idee" });
  assert.deepEqual(testi(".nome-cantiere"), ["avvisi telegram", "navigazione-dashboard/figlio"]);
  await smonta();
});

test("scelto un cantiere la colonna si chiude da sola, con la puntina accesa no", async () => {
  const libera = await monta({});
  await clic(".voce");
  assert.deepEqual(libera.chiamate.scegli, [{ tipo: "cantiere", id: 100 }]);
  assert.deepEqual(libera.chiamate.colonne, [{ colonna: false }]);
  await libera.smonta();

  const fissata = await monta({ colonne: { colonna: true, fissata: true, scheda: true } });
  assert.equal($('button[aria-label="Tieni aperta la colonna"]')!.getAttribute("aria-pressed"), "true");
  await clic(".voce");
  assert.deepEqual(fissata.chiamate.colonne, []);
  await fissata.smonta();
});

test("livello progetti: doppio clic sul titolo per la pagina del committente, o per la home nella vista ristretta", async () => {
  const { chiamate, smonta } = await monta({ posizione: { livello: "progetti", cm: 1 }, selezione: { tipo: "committente", id: 1 } });
  assert.deepEqual(testi(".nome-progetto"), ["cantiere", "mercurius"]);
  assert.equal($("h2.livello-titolo")!.title, "doppio click: apre la pagina del committente");
  assert.ok($(".indice-piede button"), "«Nuovo committente» c'è fuori dalla vista ristretta");
  await clic(".voce");
  assert.deepEqual(chiamate.scegli, [{ tipo: "progetto", id: 10 }]);
  await clic('button[aria-label="Torna ai committenti"]');
  assert.deepEqual(chiamate.posizione, [{ livello: "committenti" }]);
  await smonta();

  const ristretta = await monta({ posizione: { livello: "progetti", cm: 1 }, ristretta: true });
  assert.equal($("h2.livello-titolo")!.title, "doppio click: torna alla home");
  assert.ok(!$(".indice-piede button"), "niente «Nuovo committente» nella vista ristretta");
  await ristretta.smonta();
});

test("tornando su il fuoco va al titolo del livello nuovo, e l'entrata da sinistra resta ai ridisegni", async () => {
  const { mostra, smonta } = await monta({});
  $("button.indietro")!.focus();
  await clic("button.indietro");
  await mostra({ posizione: { livello: "progetti", cm: 1 } });
  assert.ok(window.document.activeElement?.matches("h2.livello-titolo"), "il fuoco è sul titolo del livello");
  assert.ok($(".livello")!.classList.contains("da-sinistra"));
  await mostra({ posizione: { livello: "progetti", cm: 1 }, release: "26.10.11" });
  assert.ok($(".livello")!.classList.contains("da-sinistra"), "un ridisegno non cambia l'animazione");
  await smonta();
});

test("un progetto sparito riporta al livello sopra", async () => {
  const { smonta } = await monta({ posizione: { livello: "cantieri", cm: 1, p: 99 } });
  assert.deepEqual(testi(".nome-progetto"), ["cantiere", "mercurius"]);
  await smonta();
});

test("colonna chiusa: rotaia «sfoglia» con il pallino di tutte le domande; chiudendo, il fuoco va a «sfoglia»", async () => {
  const { chiamate, mostra, smonta } = await monta({});
  await clic('button[aria-label="Chiudi la colonna"]');
  assert.deepEqual(chiamate.colonne, [{ colonna: false }]);
  await mostra({ colonne: { colonna: false, fissata: false, scheda: true } });
  assert.ok(!$(".livello"), "nessun livello nella rotaia");
  assert.ok(window.document.activeElement?.matches("button.sfoglia"), "il fuoco è su «sfoglia»");
  assert.equal($(".rotaia .pallino")!.getAttribute("aria-label"), "2 domande in attesa di risposta");
  await clic('button[aria-label="Apri la colonna: committenti, progetti, cantieri"]');
  assert.deepEqual(chiamate.colonne, [{ colonna: false }, { colonna: true }]);
  await smonta();
});

test("aperta da fuori la colonna prende il fuoco rimasto nel vuoto, non quello che sta altrove", async () => {
  const chiusa = { colonne: { colonna: false, fissata: false, scheda: true } };
  const { mostra, smonta } = await monta(chiusa);
  (window.document.activeElement as HTMLElement | null)?.blur();
  await mostra({ colonne: { colonna: true, fissata: false, scheda: true } });
  assert.ok(window.document.activeElement?.matches(".livello-titolo"), "il fuoco è sul titolo del livello");
  await mostra(chiusa);
  const altrove = window.document.createElement("button");
  window.document.body.append(altrove);
  altrove.focus();
  await mostra({ colonne: { colonna: true, fissata: false, scheda: true } });
  assert.ok(window.document.activeElement === altrove, "il fuoco resta dov'era");
  altrove.remove();
  await smonta();
});

test("percorso: committente, progetto, padri dal più alto e cantiere; un bottone per ogni livello sopra", async () => {
  const [cm] = ALBERO;
  const p = progetto(10, "cantiere", [cantiere(1, "a", "aperto"), cantiere(2, "b", "aperto", { padre_id: 1 }), cantiere(3, "c", "aperto", { padre_id: 2 })]);
  const segmenti = segmentiDi({ tipo: "cantiere", cm, p, c: p.cantieri[2] });
  assert.deepEqual(segmenti.map((s: { testo: string }) => s.testo), ["PRIV", "cantiere", "a", "b", "c"]);
  assert.deepEqual(segmenti.map((s: { scelta?: object }) => s.scelta),
    [{ tipo: "committente", id: 1 }, { tipo: "progetto", id: 10 }, { tipo: "cantiere", id: 1 }, { tipo: "cantiere", id: 2 }, undefined]);
  assert.deepEqual(posizioneDi({ tipo: "committente", cm }), { livello: "progetti", cm: 1 });
  assert.deepEqual(posizioneDi({ tipo: "cantiere", cm, p, c: p.cantieri[2] }), { livello: "cantieri", cm: 1, p: 10 });
  assert.deepEqual(posizioneDi(null), { livello: "committenti" });

  const scelte: unknown[] = [];
  const radice = createRoot($("#radice"));
  await React.act(async () => radice.render(React.createElement(Percorso, { segmenti, onScegli: (s: unknown) => scelte.push(s) })));
  assert.deepEqual(testi(".percorso button"), ["PRIV", "cantiere", "a", "b"]);
  // La «/» chiude ogni segmento tranne l'ultimo: andando a capo resta a fine riga.
  assert.deepEqual([...window.document.querySelectorAll(".percorso li")].map((li) => li.lastElementChild!.className), ["sep", "sep", "sep", "sep", ""]);
  assert.equal($('[aria-current="page"]')!.textContent, "c");
  await clic(".percorso li:nth-child(2) button");
  assert.deepEqual(scelte, [{ tipo: "progetto", id: 10 }]);
  await React.act(async () => radice.unmount());
});

test("indirizzo: un nome per segmento, codificato; andata e ritorno; un indirizzo sbagliato non sceglie niente", () => {
  const [cm] = ALBERO;
  const [p] = cm.progetti;
  const figlio = p.cantieri[3];
  assert.equal(hashDi({ tipo: "committente", cm }), "#/PRIV");
  assert.equal(hashDi({ tipo: "progetto", cm, p }), "#/PRIV/cantiere");
  assert.equal(hashDi({ tipo: "cantiere", cm, p, c: p.cantieri[1] }), "#/PRIV/cantiere/avvisi%20telegram");
  assert.equal(hashDi({ tipo: "cantiere", cm, p, c: figlio }), "#/PRIV/cantiere/navigazione-dashboard/figlio");
  assert.deepEqual(selezioneDaHash(ALBERO, "#/PRIV"), { tipo: "committente", id: 1 });
  assert.deepEqual(selezioneDaHash(ALBERO, "#/PRIV/mercurius"), { tipo: "progetto", id: 11 });
  assert.deepEqual(selezioneDaHash(ALBERO, "#/PRIV/cantiere/avvisi%20telegram"), { tipo: "cantiere", id: 101 });
  assert.deepEqual(selezioneDaHash(ALBERO, "#/PRIV/cantiere/navigazione-dashboard/figlio"), { tipo: "cantiere", id: 103 });
  for (const sbagliato of ["", "#", "#/ALTRO", "#/PRIV/poker", "#/PRIV/cantiere/figlio", "#/PRIV/%E0"]) {
    assert.equal(selezioneDaHash(ALBERO, sbagliato), null, sbagliato);
  }
});
