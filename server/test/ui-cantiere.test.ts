// Pagina del cantiere: scheda «Da fare» nella colonna centrale, origine tradotta, giornale vuoto dei cantieri nati dal repo,
// azioni dei documenti e modifica di un file di un'idea (con i click veri in jsdom).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const richiedi = createRequire(import.meta.url);
const { window } = new JSDOM("<!doctype html><div id=radice></div>");
// Nel browser arrivano come script UMD da /ui/vendor/. window e document servono a react-dom/client, prima di caricarlo.
Object.assign(globalThis, {
  markdownit: richiedi("markdown-it"), React: richiedi("react"), window, document: window.document,
  addEventListener: window.addEventListener.bind(window), IS_REACT_ACT_ENVIRONMENT: true,
});
const { renderToStaticMarkup } = richiedi("react-dom/server");
const { createRoot } = richiedi("react-dom/client");
const React = richiedi("react");
const dist = (nome: string) => import(new URL(`../ui/dist/${nome}`, import.meta.url).href);
const { impostaLingua } = await dist("testi.js");
const { SchedaCantiere } = await dist("scheda.js");
const { LavoroCantiere } = await dist("lavori.js");
const { TaskERami, righeTask } = await dist("rami.js");
impostaLingua("it");

const niente = () => {};
const html = (componente: unknown, props: object) => renderToStaticMarkup(React.createElement(componente, props));
const dettaglio = (cantiere: object, task_aperti: string[] = []) => ({
  cantiere: {
    id: 1, progetto: "mercurius", nome: "crescita", percorso: "crescita", padre_id: null, stato: "aperto", origine: "repo", change: "crescita",
    descrizione: null, creato_il: "2026-10-15T17:32:56Z", aggiornato_il: "2026-10-15T17:32:56Z", artefatti: null, task: { fatti: 0, totali: 6 },
    fasi: null, change_mancante: false, da_archiviare: false, file_idea: 0, domande_in_attesa: 0, domande: [], sessioni: [], nato_da: [], ...cantiere,
  },
  turni: [], file: [], task_aperti, verifiche: [], comandi: [], todo: [], esiti: [], discendenti_attivi: [],
});

test("lavoro: con task aperti la prima scheda è «Da fare», con tutti i task formattati; la scheda a destra non li ripete", () => {
  const aperti = ["1.1 cancellare `a.json`", "1.2 b", "1.3 c", "1.4 d", "1.5 e", "1.6 f"];
  const d = dettaglio({}, aperti);
  const lavoro = html(LavoroCantiere, { d, cantieri: [], onScegli: niente, onFile: niente, onTogliFile: niente });
  const schede = [...lavoro.matchAll(/role="tab"[^>]*>([^<]+)/g)].map((m) => m[1]);
  assert.deepEqual(schede, ["Da fare", "Task e rami", "Giornale", "Change"]);
  assert.match(lavoro, /aria-selected="true"[^>]*>Da fare/);
  assert.match(lavoro, /1\.1 cancellare <code>a\.json<\/code>/);
  assert.match(lavoro, /1\.6 f/);
  const scheda = html(SchedaCantiere, { d, onEsito: niente, onModifica: niente, onNuovaIdea: niente });
  assert.doesNotMatch(scheda, /1\.1 cancellare/);
  assert.match(scheda, /dal repo \(openspec\)/);
});

test("lavoro: senza task aperti niente scheda «Da fare», si apre il giornale", () => {
  const lavoro = html(LavoroCantiere, { d: dettaglio({}), cantieri: [], onScegli: niente, onFile: niente, onTogliFile: niente });
  assert.doesNotMatch(lavoro, />Da fare/);
  assert.match(lavoro, /aria-selected="true"[^>]*>Giornale/);
});

test("scheda: storico e sessioni attive senza valori grezzi", () => {
  const d = { ...dettaglio({ sessioni: [{ session_id: "s1", host: "mine", branch: null, stato: "attiva", titolo: null, fatto: null, prossimo: null, eta_secondi: 0, subagenti: {} }] }),
    esiti: [{ stato: "aperto", ts: "2026-10-15T17:32:56Z", da: "presa" }] };
  const scheda = html(SchedaCantiere, { d, onEsito: niente, onModifica: niente, onNuovaIdea: niente });
  assert.match(scheda, /presa con \/cantiere prendi/);
  assert.match(scheda, /pronta · adesso/);
});

test("giornale vuoto: un cantiere nato dal repo dice da dove viene, le altre origini restano come prima", () => {
  const lavoro = (origine: string) => html(LavoroCantiere, { d: dettaglio({ origine }), cantieri: [], onScegli: niente, onFile: niente, onTogliFile: niente });
  assert.match(lavoro("repo"), /Cantiere creato dalla copia di openspec\/changes\/ del repo/);
  assert.match(lavoro("utente"), /Nessun resoconto ancora/);
});

test("documento di un'idea: azioni a icone con il testo come tooltip, Modifica e Togli solo sui file dell'idea", () => {
  const file = [{ percorso: "idee/appunti.md", contenuto: "# Appunti" }];
  const azioni = (d: object) => [...html(LavoroCantiere, { d, cantieri: [], onScegli: niente, onFile: niente, onTogliFile: niente })
    .matchAll(/<button[^>]*title="([^"]+)"[^>]*aria-label="\1"[^>]*><svg/g)].map((m) => m[1]);
  assert.deepEqual(azioni({ ...dettaglio({ stato: "idea" }), file }), ["Modifica", "Copia negli appunti", "Salva sul computer", "Togli"]);
  // Un'idea con la copia di un change archiviato con lo stesso nome mostra i file del change: niente Modifica né Togli.
  assert.deepEqual(azioni({ ...dettaglio({ stato: "idea" }), file: [{ percorso: "proposal.md", contenuto: "# P" }] }), ["Copia negli appunti", "Salva sul computer"]);
});

// ---- Modifica di un file di un'idea, con i click veri

// Niente elementi jsdom dentro assert.equal: se fallisce, stampandoli il processo si pianta.
const $ = <E extends Element = HTMLElement>(sel: string) => window.document.querySelector<E>(sel);
const clic = (sel: string) => React.act(async () => $(sel)!.click());
const scrivi = (testo: string) => React.act(async () => {
  const campo = $<HTMLTextAreaElement>("textarea.modifica-documento")!;
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(campo, testo);
  campo.dispatchEvent(new window.Event("input", { bubbles: true }));
});
const idea = (id: number) => ({
  ...dettaglio({ id, stato: "idea" }),
  file: [{ percorso: "idee/a.md", contenuto: `# A di ${id}` }, { percorso: "idee/b.md", contenuto: "# B" }],
});
/** Monta la pagina di un'idea; `salva` decide l'esito di ogni salvataggio. */
async function monta(salva: (nome: string, testo: string) => Promise<boolean>) {
  const radice = createRoot($("#radice"));
  const mostra = (d: object) => React.act(async () => radice.render(React.createElement(LavoroCantiere, { d, cantieri: [], onScegli: niente, onFile: niente, onTogliFile: niente, onSalvaFile: salva })));
  return { mostra, smonta: () => React.act(async () => radice.unmount()) };
}
const chiudendo = () => {
  const evento = new window.Event("beforeunload", { cancelable: true });
  window.dispatchEvent(evento);
  return evento.defaultPrevented;
};

test("modifica: il testo nuovo va al server; mentre salva il campo è fermo; se non riesce la bozza resta", async () => {
  const chiamate: [string, string][] = [];
  let esito!: (ok: boolean) => void;
  const { mostra, smonta } = await monta((nome, testo) => (chiamate.push([nome, testo]), new Promise((r) => (esito = r))));
  await mostra(idea(1));
  await clic('button[aria-label="Modifica"]');
  assert.equal($<HTMLTextAreaElement>("textarea.modifica-documento")!.value, "# A di 1");
  assert.ok($<HTMLButtonElement>(".voce-file:not(.attiva)")!.disabled, "gli altri file restano chiusi mentre si modifica");
  await scrivi("# A\n\nnuovo");
  assert.ok(chiudendo(), "con una bozza aperta il browser chiede conferma");

  await clic('button[aria-label="Salva le modifiche"]');
  assert.deepEqual(chiamate, [["a.md", "# A\n\nnuovo"]]);
  assert.ok($<HTMLTextAreaElement>("textarea.modifica-documento")!.readOnly);
  assert.ok($<HTMLButtonElement>('button[aria-label="Salva le modifiche"]')!.disabled);
  await React.act(async () => esito(false));
  assert.equal($<HTMLTextAreaElement>("textarea.modifica-documento")!.value, "# A\n\nnuovo");
  assert.ok(!$<HTMLTextAreaElement>("textarea.modifica-documento")!.readOnly);

  await clic('button[aria-label="Salva le modifiche"]');
  await React.act(async () => esito(true));
  assert.ok(!$("textarea.modifica-documento"), "il campo di modifica è chiuso");
  assert.ok(!chiudendo(), "salvata la bozza, si chiude senza domande");
  await smonta();
});

test("modifica: la bozza resta cambiando idea e tornando, e non finisce sul file con lo stesso nome dell'altra", async () => {
  const prima = await monta(async () => true);
  await prima.mostra(idea(1));
  await clic('.voce-file:not(.attiva)');
  await clic('button[aria-label="Modifica"]');
  await scrivi("# B cambiato");
  await prima.mostra({ ...idea(2), file: [{ percorso: "idee/b.md", contenuto: "# B di 2" }] });
  assert.ok(!$("textarea.modifica-documento"), "il campo di modifica è chiuso");
  assert.match($("article.documento")!.textContent!, /B di 2/);
  // Come quando il dettaglio dell'idea non è ancora arrivato: la pagina si smonta e si rimonta.
  await prima.smonta();
  const { mostra, smonta } = await monta(async () => true);
  await mostra(idea(1));
  assert.equal($("article.documento code")!.textContent, "idee/b.md");
  assert.equal($<HTMLTextAreaElement>("textarea.modifica-documento")!.value, "# B cambiato");
  await clic('button[aria-label="Annulla"]');
  assert.ok(!$("textarea.modifica-documento"), "il campo di modifica è chiuso");
  assert.ok(!chiudendo());
  await smonta();
});

test("modifica: abbandonata l'idea o tolto il file, la bozza si scarta e il browser non chiede più conferma", async () => {
  const { mostra, smonta } = await monta(async () => true);
  for (const dopo of [{ ...idea(1), cantiere: { ...idea(1).cantiere, stato: "abbandonato" } }, { ...idea(1), file: [idea(1).file[1]] }]) {
    await mostra(idea(1));
    await clic('button[aria-label="Modifica"]');
    await scrivi("# A cambiato");
    assert.ok(chiudendo());
    await mostra(dopo);
    assert.ok(!chiudendo(), "nessuna conferma per una bozza che non si vede");
  }
  await smonta();
});

test("modifica: uscendo e rientrando durante il salvataggio, il testo scritto dopo resta una bozza", async () => {
  let esito!: (ok: boolean) => void;
  const prima = await monta(() => new Promise((r) => (esito = r)));
  await prima.mostra(idea(1));
  await clic('button[aria-label="Modifica"]');
  await scrivi("# A uno");
  await clic('button[aria-label="Salva le modifiche"]');
  await prima.smonta();
  const { mostra, smonta } = await monta(async () => true);
  await mostra(idea(1));
  await scrivi("# A uno e due");
  await React.act(async () => esito(true));
  assert.equal($<HTMLTextAreaElement>("textarea.modifica-documento")!.value, "# A uno e due");
  assert.ok(chiudendo(), "la bozza nuova chiede ancora conferma");
  await clic('button[aria-label="Annulla"]');
  await smonta();
});

// ---- Editor EasyMDE, come nel browser

const { impostaLingua: lingua } = await dist("testi.js");
type CodeMirror = { getValue(): string; setValue(v: string): void; setCursor(r: number, c: number): void; getOption(o: string): any };
const codemirror = () => ($(".CodeMirror") as unknown as { CodeMirror: CodeMirror }).CodeMirror;
const titoli = () => [...window.document.querySelectorAll(".editor-toolbar button")].map((b) => b.getAttribute("aria-label"));
/** Carica EasyMDE solo per `prova`: gli altri test provano il textarea che resta senza. */
async function conEasyMDE(salva: (nome: string, testo: string) => Promise<boolean>, prova: (mostra: (d: object) => Promise<void>) => Promise<void>) {
  Object.assign(globalThis, { EasyMDE: richiedi("easymde"), ReactDOM: richiedi("react-dom") });
  // CodeMirror misura il testo con Range, che jsdom non impagina: bastano misure vuote.
  Object.assign(window.Range.prototype, { getBoundingClientRect: () => new window.DOMRect(), getClientRects: () => [] });
  const { mostra, smonta } = await monta(salva);
  try {
    await mostra(idea(1));
    await clic('button[aria-label="Modifica"]');
    await prova(mostra);
  } finally {
    await smonta();
    delete (globalThis as { EasyMDE?: unknown }).EasyMDE;
  }
}

test("editor: barra a icone del design system; il testo scritto va al salvataggio, e se cambia mentre salva resta aperto", async () => {
  const chiamate: string[] = [];
  let esito!: (ok: boolean) => void;
  await conEasyMDE((_nome, testo) => (chiamate.push(testo), new Promise((r) => (esito = r))), async () => {
    assert.deepEqual(titoli(), ["Grassetto", "Corsivo", "Titolo", "Elenco puntato", "Elenco numerato", "Elenco di task", "Citazione", "Codice",
      "Collegamento", "Anteprima", "Anteprima affiancata"]);
    assert.ok([...window.document.querySelectorAll(".editor-toolbar button")].every((b) => b.querySelector("svg path")), "ogni pulsante ha la sua icona");
    assert.equal(codemirror().getValue(), "# A di 1");
    await React.act(async () => codemirror().setValue("uno due"));
    await clic('button[aria-label="Salva le modifiche"]');
    assert.deepEqual(chiamate, ["uno due"]);
    assert.equal(codemirror().getOption("readOnly"), true);
    assert.equal($(".editor-markdown")!.getAttribute("aria-busy"), "true");
    await clic('.editor-toolbar button.bold');
    await React.act(async () => esito(true));
    assert.notEqual(codemirror().getValue(), "uno due");
    assert.ok(chiudendo(), "il testo cambiato mentre salvava resta una bozza aperta");
    await React.act(async () => codemirror().setValue("uno due tre"));
    await clic('button[aria-label="Salva le modifiche"]');
    await React.act(async () => esito(true));
    assert.ok(!$(".EasyMDEContainer"), "salvato, l'editor si chiude");
    assert.ok(!chiudendo());
  });
});

test("editor: anteprima col nostro Markdown anche dopo l'anteprima piena, pulsanti accesi, Tab libero, titoli nella lingua scelta", async () => {
  await conEasyMDE(async () => true, async (mostra) => {
    await React.act(async () => codemirror().setValue("**uno** due\n\n- [ ] da fare"));
    await React.act(async () => codemirror().setCursor(0, 3));
    assert.ok($(".editor-toolbar button.bold")!.classList.contains("active"), "il cursore nel grassetto accende Grassetto");
    await clic('.editor-toolbar button.preview');
    await clic('.editor-toolbar button.side-by-side');
    assert.ok($(".editor-preview-side input.casella"), "l'anteprima affiancata passa da rendiMarkdown");
    assert.equal(codemirror().getOption("extraKeys").Tab, false);
    lingua("en");
    try {
      await mostra(idea(1));
      assert.equal(titoli()[0], "Bold");
      assert.equal(codemirror().getValue(), "**uno** due\n\n- [ ] da fare");
    } finally {
      lingua("it");
      await mostra(idea(1));
    }
    await clic('button[aria-label="Annulla"]');
  });
});

// «Task e rami»: da chi è nato il cantiere, i task di tasks.md e accanto a ciascuno i rami, anche verso altri progetti.
const cantiereDi = (id: number, progetto: string, percorso: string, extra: object = {}) => ({ ...dettaglio({ id, progetto, nome: percorso, percorso, change: percorso, ...extra }).cantiere });
const TASKS = "# Tasks\n\n## 1. Push al trade server\n\n- [ ] 1.1 Togliere `single()` dal push\n  (i mix dipendono da basket-mix)\n- [x] 1.2 Formato di push_record\n- [ ] Senza numero\n";
const multi = cantiereDi(3, "parity-deriva", "multi-instrument-simulations");
const basket = cantiereDi(45, "parity-deriva", "basket-mix", { task: { fatti: 7, totali: 8 }, nato_da: [{ id: 3, progetto: "parity-deriva", percorso: "multi-instrument-simulations", task: "1.1", tipo: "citato" }] });
const fuori = cantiereDi(49, "mercurius", "info-extra", { stato: "idea", task: null, nato_da: [{ id: 3, progetto: "parity-deriva", percorso: "multi-instrument-simulations", task: null, tipo: "registrato" }] });

test("task e rami: righe di tasks.md con titoli, numeri, caselle e righe che continuano", () => {
  assert.deepEqual(righeTask(TASKS), [
    { tipo: "titolo", testo: "1. Push al trade server" },
    { tipo: "task", fatto: false, numero: "1.1", testo: "Togliere `single()` dal push (i mix dipendono da basket-mix)" },
    { tipo: "task", fatto: true, numero: "1.2", testo: "Formato di push_record" },
    { tipo: "task", fatto: false, numero: null, testo: "Senza numero" },
  ]);
});

test("task e rami: il ramo citato accanto al suo task con l'avanzamento; quello senza task in testa, col progetto se è un altro", () => {
  const pagina = html(TaskERami, { c: multi, tasks: TASKS, cantieri: [multi, basket, fuori], onScegli: niente });
  const riga11 = pagina.slice(pagina.indexOf(">1.1<"), pagina.indexOf(">1.2<"));
  assert.match(riga11, /class="cartellino citato"[\s\S]*basket-mix[\s\S]*7\/8[\s\S]*citato/);
  const testa = pagina.slice(0, pagina.indexOf("righe-task"));
  assert.match(testa, /Nessuno: non è nato da un altro cantiere/);
  assert.match(testa, /2 rami/);
  assert.match(testa, /mercurius \/ info-extra/);
  assert.match(testa, /1 ramo accanto al suo task/);
  assert.doesNotMatch(testa, /basket-mix/);
  const ramo = html(TaskERami, { c: basket, tasks: null, cantieri: [multi, basket, fuori], onScegli: niente });
  assert.match(ramo, /multi-instrument-simulations[\s\S]*dal task 1\.1[\s\S]*citato/);
  assert.match(ramo, /Nessun tasks\.md/);
});

test("task e rami: un clic su un ramo lo apre", async () => {
  const contenitore = window.document.createElement("div");
  const radice = createRoot(contenitore);
  const scelte: object[] = [];
  await React.act(async () => radice.render(React.createElement(TaskERami, { c: multi, tasks: TASKS, cantieri: [multi, basket, fuori], onScegli: (s: object) => scelte.push(s) })));
  const ramo = [...contenitore.querySelectorAll<HTMLElement>(".cartellino")].find((b) => b.textContent!.includes("basket-mix"))!;
  await React.act(async () => ramo.click());
  assert.deepEqual(scelte, [{ tipo: "cantiere", id: 45 }]);
  await React.act(async () => radice.unmount());
});

test("task e rami: la × toglie un «nato da»; «Aggiungi» propone le partenze, prima quelle del progetto, senza sé stesso, fasi e quelle che ha già", async () => {
  const scritture: { url: string; corpo: unknown }[] = [];
  const fetchVero = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    scritture.push({ url, corpo: JSON.parse(String(init.body)) });
    return { ok: true, status: 200, json: async () => ({}) };
  }) as unknown as typeof fetch;
  let aggiornamenti = 0;
  const piano = cantiereDi(60, "parity-deriva", "piano");
  const fase = cantiereDi(61, "parity-deriva", "basket-mix/fase", { padre_id: 45 });
  const altro = cantiereDi(62, "audio", "riassunto");
  const contenitore = window.document.createElement("div");
  const radice = createRoot(contenitore);
  const bottone = (testo: string) => [...contenitore.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.title || b.textContent!).includes(testo))!;
  const imposta = (campo: HTMLInputElement | HTMLSelectElement, valore: string, evento: string) => React.act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(campo), "value")!.set!.call(campo, valore);
    campo.dispatchEvent(new window.Event(evento, { bubbles: true }));
  });
  try {
    await React.act(async () => radice.render(React.createElement(TaskERami, {
      c: basket, tasks: null, cantieri: [multi, basket, fuori, piano, fase, altro], onScegli: niente, onAggiorna: async () => void aggiornamenti++,
    })));
    await React.act(async () => bottone("Togli «nato da» multi-instrument-simulations").click());
    assert.deepEqual(scritture, [{ url: "ui/api/cantieri/45/nato-da/togli", corpo: { da: 3 } }]);
    await React.act(async () => bottone("Aggiungi «nato da»").click());
    const gruppi = [...contenitore.querySelectorAll("optgroup")].map((g) => [g.label, [...g.querySelectorAll("option")].map((o) => o.textContent)]);
    assert.deepEqual(gruppi, [["parity-deriva", ["piano"]], ["audio", ["riassunto"]], ["mercurius", ["info-extra"]]]);
    assert.equal(bottone("Lega").disabled, true);
    await imposta(contenitore.querySelector("select")!, "60", "change");
    await imposta(contenitore.querySelector("input")!, " 2.1 ", "input");
    await React.act(async () => bottone("Lega").click());
    assert.deepEqual(scritture[1], { url: "ui/api/cantieri/45/nato-da", corpo: { da: 60, task: "2.1" } });
    assert.equal(aggiornamenti, 2);
    assert.equal(contenitore.querySelector("select"), null);
  } finally {
    globalThis.fetch = fetchVero;
    await React.act(async () => radice.unmount());
  }
});

test("scheda: subagenti accanto alla sessione, i più usati per primi; senza subagenti niente riga", () => {
  const sessione = (subagenti: object) => ({ session_id: "s1", host: "mine", branch: null, stato: "lavorando", titolo: "Prova", fatto: null, prossimo: null, eta_secondi: 0, subagenti });
  const scheda = (subagenti: object) => html(SchedaCantiere, { d: dettaglio({ sessioni: [sessione(subagenti)] }), onEsito: niente, onModifica: niente, onNuovaIdea: niente });
  assert.match(scheda({ "general-purpose": 1, Explore: 2 }), /3 subagenti · 2 Explore · 1 general-purpose/);
  assert.doesNotMatch(scheda({}), /subagent/);
});
