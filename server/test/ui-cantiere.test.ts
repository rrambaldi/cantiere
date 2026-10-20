// Pagina del cantiere: scheda «Da fare» nella colonna centrale, origine tradotta, giornale vuoto dei cantieri nati dal repo.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const richiedi = createRequire(import.meta.url);
// Nel browser arrivano come script UMD da /ui/vendor/.
Object.assign(globalThis, { markdownit: richiedi("markdown-it"), React: richiedi("react") });
const { renderToStaticMarkup } = richiedi("react-dom/server");
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
