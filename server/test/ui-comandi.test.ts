// Dalla dashboard alla sessione, con i click veri in jsdom: «Confermo» e «Non va» su domande e task di verifica,
// comandi scritti e annullati. Il fetch finto registra le scritture e risponde sempre bene.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";
import { JSDOM } from "jsdom";

const richiedi = createRequire(import.meta.url);
const { window } = new JSDOM("<!doctype html><div id=radice></div>");
const scritture: { url: string; corpo: unknown }[] = [];
Object.assign(globalThis, {
  markdownit: richiedi("markdown-it"), React: richiedi("react"), window, document: window.document, HTMLElement: window.HTMLElement,
  addEventListener: window.addEventListener.bind(window), IS_REACT_ACT_ENVIRONMENT: true,
  fetch: async (url: string, init: RequestInit) => {
    if (init.method === "POST") scritture.push({ url, corpo: JSON.parse(String(init.body)) });
    return { ok: true, status: 200, json: async () => ({}) };
  },
});
const React = richiedi("react");
const { createRoot } = richiedi("react-dom/client");
const dist = (nome: string) => import(new URL(`../ui/dist/${nome}`, import.meta.url).href);
const { impostaLingua } = await dist("testi.js");
const { LavoroCantiere } = await dist("lavori.js");
const { SchedaCantiere } = await dist("scheda.js");
impostaLingua("it");

const ORA = "2026-10-27T08:00:00Z";
const TASK = "1.2 Verificare nel browser";
const comando = (extra: object) => ({ id: 7, session_id: "s1", cantiere_id: null, task: null, esito: null, testo: "esegui i test", stato: "in_attesa", creato_il: ORA, consegnato_il: null, ...extra });
const dettaglio = {
  cantiere: {
    id: 1, progetto: "app", nome: "nis2", percorso: "nis2", padre_id: null, stato: "aperto", origine: "utente", change: "nis2", descrizione: null,
    creato_il: ORA, aggiornato_il: ORA, artefatti: null, task: { fatti: 0, totali: 2 }, fasi: null, change_mancante: false, da_archiviare: false, file_idea: 0,
    domande_in_attesa: 1, domande: [{ id: "d1", session_id: "s1", tipo: "scelta", testo: "Il bottone si vede?", opzioni: [], host: "mine", ts: ORA, eta_secondi: 60 }],
    sessioni: [{ session_id: "s1", host: "mine", branch: null, stato: "in_attesa", titolo: null, fatto: null, prossimo: null, eta_secondi: 0, subagenti: {} }], nato_da: [],
  },
  turni: [], file: [], task_aperti: ["1.1 Scrivere la rotta", TASK], verifiche: [TASK],
  comandi: [comando({}), comando({ id: 8, session_id: null, cantiere_id: 1, task: TASK, esito: "negato", testo: "al telefono no", stato: "consegnato", consegnato_il: ORA })],
  todo: [], esiti: [], discendenti_attivi: [],
};

const $ = (sel: string, testo = "") => [...window.document.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent!.includes(testo)) ?? null;
const clic = (sel: string, testo = "") => React.act(async () => $(sel, testo)!.click());
const scrivi = (testo: string) => React.act(async () => {
  const campo = $("textarea") as HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(campo, testo);
  campo.dispatchEvent(new window.Event("input", { bubbles: true }));
});
let aggiornamenti = 0;
const onAggiorna = async () => void aggiornamenti++;
const niente = () => {};
async function monta(componente: unknown, props: object) {
  const radice = createRoot($("#radice"));
  await React.act(async () => radice.render(React.createElement(componente, { d: dettaglio, onAggiorna, ...props })));
  return () => React.act(async () => radice.unmount());
}
beforeEach(() => {
  scritture.length = 0;
  aggiornamenti = 0;
});

test("«Non va» su una domanda chiede il feedback e lo manda con l'id della domanda", async () => {
  const smonta = await monta(LavoroCantiere, { cantieri: [], onScegli: niente, onFile: niente, onTogliFile: niente, onSalvaFile: niente });
  await clic(".domanda button", "Non va");
  assert.ok($(".domanda button", "Invia")!.hasAttribute("disabled"), "senza feedback non si invia");
  await scrivi("non si vede al telefono");
  await clic(".domanda button", "Invia");
  assert.deepEqual(scritture, [{ url: "ui/api/domande/esito", corpo: { session_id: "s1", domanda_id: "d1", esito: "negato", feedback: "non si vede al telefono" } }]);
  assert.equal(aggiornamenti, 1);
  await smonta();
});

test("task di verifica: l'ultimo esito con il feedback, e «Confermo» solo sui task di verifica", async () => {
  const smonta = await monta(LavoroCantiere, { cantieri: [], onScegli: niente, onFile: niente, onTogliFile: niente, onSalvaFile: niente });
  const righe = window.document.querySelectorAll(".task-aperti li");
  assert.deepEqual([...righe].map((r) => !!r.querySelector(".verifica-task")), [false, true]);
  assert.match(righe[1].textContent!, /Non va: al telefono no.*consegnato/);
  await clic(".verifica-task button", "Confermo");
  assert.deepEqual(scritture, [{ url: "ui/api/cantieri/1/verifica", corpo: { task: TASK, esito: "confermato" } }]);
  await smonta();
});

test("scheda: i comandi della sessione con stato e annullo, e il campo che dice quando arrivano", async () => {
  const smonta = await monta(SchedaCantiere, { onEsito: niente, onModifica: niente, onNuovaIdea: niente });
  const sessione = $(".sessioni li")!;
  assert.match(sessione.textContent!, /esegui i test.*in attesa/);
  assert.doesNotMatch(sessione.textContent!, /al telefono no/, "gli esiti dei task stanno sui task");
  await clic('.sessioni [title="Annulla il comando"]');
  await clic(".sessioni button", "Scrivi un comando");
  assert.match($(".comandi")!.textContent!, /Consegnato al prossimo passo della sessione/);
  await scrivi("continua");
  await clic(".comandi button", "Invia");
  assert.deepEqual(scritture.map((s) => [s.url, s.corpo]), [["ui/api/comandi/7/annulla", {}], ["ui/api/comandi", { session_id: "s1", testo: "continua" }]]);
  assert.equal($("textarea"), null, "inviato, il campo si chiude");
  await smonta();
});

test("scheda: i comandi di una sessione non più attiva stanno in un blocco a sé, annullabili", async () => {
  const ferma = { ...dettaglio, comandi: [comando({ id: 9, session_id: "s2", testo: "per quando torni" })] };
  const smonta = await monta(SchedaCantiere, { d: ferma, onEsito: niente, onModifica: niente, onNuovaIdea: niente });
  const blocco = [...window.document.querySelectorAll(".blocco")].find((b) => b.textContent!.includes("comandi di sessioni ferme"));
  assert.match(blocco?.textContent ?? "", /per quando torni.*in attesa/);
  assert.ok(blocco!.querySelector('[title="Annulla il comando"]'));
  assert.doesNotMatch($(".sessioni li")!.textContent!, /per quando torni/);
  await smonta();
});
