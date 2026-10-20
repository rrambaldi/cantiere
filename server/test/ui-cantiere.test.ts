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
impostaLingua("it");

const niente = () => {};
const html = (componente: unknown, props: object) => renderToStaticMarkup(React.createElement(componente, props));
const dettaglio = (cantiere: object, task_aperti: string[] = []) => ({
  cantiere: {
    id: 1, progetto: "mercurius", nome: "crescita", percorso: "crescita", padre_id: null, stato: "aperto", origine: "repo", change: "crescita",
    descrizione: null, creato_il: "2026-10-15T17:32:56Z", aggiornato_il: "2026-10-15T17:32:56Z", artefatti: null, task: { fatti: 0, totali: 6 },
    fasi: null, change_mancante: false, da_archiviare: false, file_idea: 0, domande_in_attesa: 0, domande: [], sessioni: [], ...cantiere,
  },
  turni: [], file: [], task_aperti, todo: [], esiti: [], discendenti_attivi: [],
});

test("lavoro: con task aperti la prima scheda è «Da fare», con tutti i task formattati; la scheda a destra non li ripete", () => {
  const aperti = ["1.1 cancellare `a.json`", "1.2 b", "1.3 c", "1.4 d", "1.5 e", "1.6 f"];
  const d = dettaglio({}, aperti);
  const lavoro = html(LavoroCantiere, { d, onFile: niente, onTogliFile: niente });
  const schede = [...lavoro.matchAll(/role="tab"[^>]*>([^<]+)/g)].map((m) => m[1]);
  assert.deepEqual(schede, ["Da fare", "Giornale", "Change"]);
  assert.match(lavoro, /aria-selected="true"[^>]*>Da fare/);
  assert.match(lavoro, /1\.1 cancellare <code>a\.json<\/code>/);
  assert.match(lavoro, /1\.6 f/);
  const scheda = html(SchedaCantiere, { d, onEsito: niente, onModifica: niente, onNuovaIdea: niente });
  assert.doesNotMatch(scheda, /1\.1 cancellare/);
  assert.match(scheda, /dal repo \(openspec\)/);
});

test("lavoro: senza task aperti niente scheda «Da fare», si apre il giornale", () => {
  const lavoro = html(LavoroCantiere, { d: dettaglio({}), onFile: niente, onTogliFile: niente });
  assert.doesNotMatch(lavoro, />Da fare/);
  assert.match(lavoro, /aria-selected="true"[^>]*>Giornale/);
});

test("scheda: storico e sessioni attive senza valori grezzi", () => {
  const d = { ...dettaglio({ sessioni: [{ session_id: "s1", host: "mine", branch: null, stato: "attiva", titolo: null, fatto: null, prossimo: null, eta_secondi: 0 }] }),
    esiti: [{ stato: "aperto", ts: "2026-10-15T17:32:56Z", da: "presa" }] };
  const scheda = html(SchedaCantiere, { d, onEsito: niente, onModifica: niente, onNuovaIdea: niente });
  assert.match(scheda, /presa con \/cantiere prendi/);
  assert.match(scheda, /pronta · adesso/);
});

test("giornale vuoto: un cantiere nato dal repo dice da dove viene, le altre origini restano come prima", () => {
  const lavoro = (origine: string) => html(LavoroCantiere, { d: dettaglio({ origine }), onFile: niente, onTogliFile: niente });
  assert.match(lavoro("repo"), /Cantiere creato dalla copia di openspec\/changes\/ del repo/);
  assert.match(lavoro("utente"), /Nessun resoconto ancora/);
});

test("documento di un'idea: azioni a icone con il testo come tooltip, Modifica e Togli solo sui file dell'idea", () => {
  const file = [{ percorso: "idee/appunti.md", contenuto: "# Appunti" }];
  const azioni = (d: object) => [...html(LavoroCantiere, { d, onFile: niente, onTogliFile: niente })
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
  const mostra = (d: object) => React.act(async () => radice.render(React.createElement(LavoroCantiere, { d, onFile: niente, onTogliFile: niente, onSalvaFile: salva })));
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
