import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { TUTTI } from "../src/ambito.ts";
import { cambiaEsito, creaProgetto } from "../src/dominio.ts";
import { creaIdea } from "../src/idee.ts";
import { apri, avvia, cantiere, changeAttivo, copia, evento, invia, richiesta, type Banco } from "./aiuto.ts";

let b: Banco;
before(async () => (b = await avvia()));
after(() => b.chiudi());
beforeEach(async () => {
  for (const t of ["eventi", "sessioni", "cantieri", "esiti", "change_copie", "change_file", "idee_file", "legami"] as const) await b.db.deleteFrom(t).execute();
  await b.db.updateTable("progetti").set({ openspec_il: null }).execute();
});
const vuota = { attivi: [], archiviati: [] };
const file = async (percorso_slug: string) =>
  (await b.db.selectFrom("change_file").select(["percorso", "contenuto"]).where("cantiere_id", "=", (await cantiere(b, percorso_slug)).id).orderBy("percorso").execute());
const letto = async (percorso: string) => ((await richiesta(b, "/api/v1/cantieri")).corpo.cantieri as any[]).find((c) => c.percorso === percorso);

test("prima copia: file conservati per il cantiere del change; stessa copia due volte, stessa risposta", async () => {
  await apri(b, "s1", "idoc-converter");
  const corpo = { attivi: [changeAttivo("idoc-converter", { "proposal.md": "# Proposta", "idee/nota.md": "appunti" })], archiviati: [] };
  const prima = await copia(b, corpo);
  assert.equal(prima.status, 200);
  assert.deepEqual(await file("idoc-converter"), [
    { percorso: "idee/nota.md", contenuto: "appunti" },
    { percorso: "proposal.md", contenuto: "# Proposta" },
  ]);
  const seconda = await copia(b, corpo);
  assert.deepEqual(seconda, prima);
  assert.deepEqual(prima.corpo.cantieri.map((c: any) => [c.percorso, c.stato]), [["idoc-converter", "aperto"]]);
});

test("percorso fuori dal change: 422 e niente salvato della copia", async () => {
  const r = await copia(b, { attivi: [changeAttivo("export-pdf", { "proposal.md": "x", "../../.env": "SEGRETO=1" })], archiviati: [] });
  assert.equal(r.status, 422);
  assert.equal((await b.db.selectFrom("cantieri").select("id").execute()).length, 0);
  assert.equal((await copia(b, { attivi: [{ ...changeAttivo("Non Kebab"), change: "Non Kebab" }], archiviati: [] })).status, 422);
});

test("macchina con un checkout vecchio: resta la copia più recente", async () => {
  await copia(b, { attivi: [changeAttivo("export-pdf", { "tasks.md": "- [x] 1\n- [x] 2" }, "2026-10-15T10:00:00Z")], archiviati: [] });
  await copia(b, { attivi: [changeAttivo("export-pdf", { "tasks.md": "- [ ] 1\n- [ ] 2" }, "2026-10-15T09:00:00Z")], archiviati: [] });
  assert.deepEqual((await letto("export-pdf")).task, { fatti: 2, totali: 2 });
});

test("change senza cantiere: nasce al primo livello, aperto, origine repo", async () => {
  await copia(b, { attivi: [changeAttivo("export-pdf")], archiviati: [] });
  const c = await cantiere(b, "export-pdf");
  assert.deepEqual([c.padre_id, c.stato, c.origine, c.change], [null, "aperto", "repo", "export-pdf"]);
});

test("completato dal repo con la data di archivio; poi visto attivo resta completato", async () => {
  await apri(b, "s1", "export-pdf");
  await copia(b, { attivi: [changeAttivo("export-pdf")], archiviati: [] });
  await copia(b, { attivi: [], archiviati: [{ change: "export-pdf", archiviato_il: "2026-10-20" }] });
  const c = await cantiere(b, "export-pdf");
  assert.deepEqual([c.stato, c.stato_il], ["completato", "2026-10-20"]);
  assert.match((await invia(b, evento("prompt", {}))).corpo.contesto, /export-pdf è completato: ora lavori direttamente su app/);
  await copia(b, { attivi: [changeAttivo("export-pdf", { "proposal.md": "rianimato" }, new Date(Date.now() + 60_000).toISOString())], archiviati: [] });
  assert.equal((await cantiere(b, "export-pdf")).stato, "completato");
  assert.deepEqual(await file("export-pdf"), [{ percorso: "proposal.md", contenuto: "# Proposta" }]);
});

test("archiviato con i file: la copia finale sostituisce quella attiva e aggiorna l'avanzamento", async () => {
  await apri(b, "s1", "export-pdf");
  await copia(b, { attivi: [changeAttivo("export-pdf", { "tasks.md": "- [x] 1\n- [ ] 2" })], archiviati: [] });
  const finale = [{ percorso: "specs/pdf/spec.md", contenuto: "# Spec" }, { percorso: "tasks.md", contenuto: "- [x] 1\n- [x] 2" }];
  await copia(b, { attivi: [], archiviati: [{ change: "export-pdf", archiviato_il: "2026-10-20", file: finale }] });
  assert.deepEqual(await file("export-pdf"), finale);
  const c = await letto("export-pdf");
  assert.deepEqual([c.stato, c.task, c.artefatti.specs], ["completato", { fatti: 2, totali: 2 }, true]);
});

test("archivio dopo un abbandono: resta abbandonato e smette di essere da archiviare", async () => {
  const { id } = (await apri(b, "s1", "vecchio-parser")).corpo.cantiere;
  await cambiaEsito(b, TUTTI, id, "abbandona");
  await copia(b, { attivi: [changeAttivo("vecchio-parser")], archiviati: [] });
  assert.equal((await letto("vecchio-parser")).da_archiviare, true);
  await copia(b, { attivi: [], archiviati: [{ change: "vecchio-parser", archiviato_il: "2026-10-21" }] });
  const dopo = await letto("vecchio-parser");
  assert.deepEqual([dopo.stato, dopo.da_archiviare], ["abbandonato", false]);
});

test("avanzamento: artefatti presenti e task spuntati sul totale", async () => {
  const tasks = Array.from({ length: 12 }, (_, i) => `- [${i < 7 ? "x" : " "}] ${i + 1}.0 task`).join("\n");
  await copia(b, { attivi: [changeAttivo("idoc-converter-prototipo", { "proposal.md": "p", "specs/a/spec.md": "s", "tasks.md": tasks })], archiviati: [] });
  const c = await letto("idoc-converter-prototipo");
  assert.deepEqual([c.task, c.artefatti], [{ fatti: 7, totali: 12 }, { proposal: true, design: false, specs: true, tasks: true }]);
});

test("change quadro: fasi completate sul totale dei figli non abbandonati", async () => {
  for (const fase of ["prototipo", "migrazione-preprod", "preprod", "scartata"]) await apri(b, `s-${fase}`, `idoc-converter/${fase}`);
  await cambiaEsito(b, TUTTI, (await cantiere(b, "idoc-converter/scartata")).id, "abbandona");
  await copia(b, {
    attivi: [],
    archiviati: [
      { change: "idoc-converter-prototipo", archiviato_il: "2026-10-16" },
      { change: "idoc-converter-migrazione-preprod", archiviato_il: "2026-10-17" },
    ],
  });
  assert.deepEqual((await letto("idoc-converter")).fasi, { completate: 2, totali: 3 });
  assert.equal((await letto("idoc-converter/preprod")).fasi, null);
});

test("change mancante: cantiere aperto che l'ultima copia non contiene", async () => {
  await apri(b, "s1", "report");
  assert.equal((await letto("report")).change_mancante, false, "nessuna copia ancora ricevuta");
  await copia(b, vuota);
  const c = await letto("report");
  assert.deepEqual([c.stato, c.change_mancante], ["aperto", true]);
  await copia(b, { attivi: [changeAttivo("report")], archiviati: [] });
  assert.equal((await letto("report")).change_mancante, false);
});

test("un'idea il cui change compare nel repo passa ad aperto", async () => {
  await creaIdea(b, TUTTI, b.progetto.id, { nome: "iDOC converter" });
  await copia(b, { attivi: [changeAttivo("idoc-converter")], archiviati: [] });
  assert.equal((await cantiere(b, "idoc-converter")).stato, "aperto");
});

test("legami citati: il cantiere più vecchio è la partenza, il task è la riga del suo tasks.md", async () => {
  await apri(b, "s1", "multi-instrument-simulations");
  await apri(b, "s2", "basket-mix");
  await copia(b, {
    attivi: [
      changeAttivo("multi-instrument-simulations", { "tasks.md": "## 1. Push\n\n- [ ] 1.1 Togliere `single()` (i mix con panieri dipendono da `basket-mix`)\n" }),
      changeAttivo("basket-mix", { "proposal.md": "Il mix è separato da `multi-instrument-simulations`; serve `basket-live`." }),
    ],
    archiviati: [],
  });
  const multi = await cantiere(b, "multi-instrument-simulations");
  assert.deepEqual((await letto("basket-mix")).nato_da, [{ id: multi.id, progetto: "app", percorso: "multi-instrument-simulations", task: "1.1", tipo: "citato" }]);
  assert.deepEqual((await letto("multi-instrument-simulations")).nato_da, []);
});

test("legami citati: tra padre e figlio basta il padre; una citazione tolta dal file se ne va", async () => {
  await apri(b, "s1", "piano/fase-1");
  await apri(b, "s2", "altro");
  const proposta = (testo: string, quando: string) => ({ attivi: [changeAttivo("piano-fase-1", { "proposal.md": testo }, quando)], archiviati: [] });
  await copia(b, proposta("Fase di `piano`, usa `altro`.", "2026-10-20T10:00:00Z"));
  assert.deepEqual((await letto("piano/fase-1")).nato_da, []);
  assert.deepEqual((await letto("altro")).nato_da.map((n: any) => n.percorso), ["piano/fase-1"]);
  await copia(b, proposta("Fase di `piano`.", "2026-10-21T10:00:00Z"));
  assert.deepEqual((await letto("altro")).nato_da, []);
});

test("un legame registrato vince su quello citato e resta alle copie dopo", async () => {
  await apri(b, "s1", "a");
  await apri(b, "s2", "b");
  await copia(b, { attivi: [changeAttivo("b", { "proposal.md": "Parte da `a`." })], archiviati: [] });
  assert.equal((await letto("b")).nato_da[0].tipo, "citato");
  await invia(b, evento("apri_cantiere", { nome: "b", descrizione: null, origine: "utente", nato_da: "a", task: "2.1" }, { session_id: "s3" }));
  await copia(b, { attivi: [changeAttivo("b", { "proposal.md": "Parte ancora da `a`." })], archiviati: [] });
  assert.deepEqual((await letto("b")).nato_da.map((n: any) => [n.percorso, n.tipo, n.task]), [["a", "registrato", "2.1"]]);
});

test("legami citati di change visti nella stessa copia: parte quello con la data created più vecchia; task anche dalle righe che continuano", async () => {
  const yaml = (data: string) => `schema: spec-driven\ncreated: ${data}\n`;
  await copia(b, {
    attivi: [
      changeAttivo("basket-mix", { ".openspec.yaml": yaml("2026-10-20"), "proposal.md": "Separato da `multi-instrument-simulations`." }),
      changeAttivo("multi-instrument-simulations", {
        ".openspec.yaml": yaml("2026-10-15"),
        "tasks.md": "- [ ] 1.1 Togliere single() dal push\n  i mix con panieri dipendono da `basket-mix`\n\n- [ ] 1.2 Altro",
      }),
    ],
    archiviati: [],
  });
  assert.deepEqual((await letto("basket-mix")).nato_da.map((n: any) => [n.percorso, n.task, n.tipo]), [["multi-instrument-simulations", "1.1", "citato"]]);
  assert.deepEqual((await letto("multi-instrument-simulations")).nato_da, []);
});

test("legami citati: niente tra figlio e padre neanche se il figlio è più vecchio", async () => {
  await apri(b, "s1", "piano/fase-1");
  const yaml = (data: string) => `schema: spec-driven\ncreated: ${data}\n`;
  await copia(b, {
    attivi: [
      changeAttivo("piano", { ".openspec.yaml": yaml("2026-10-25"), "proposal.md": "Fasi: `piano-fase-1`." }),
      changeAttivo("piano-fase-1", { ".openspec.yaml": yaml("2026-10-20"), "proposal.md": "Fase di `piano`." }),
    ],
    archiviati: [],
  });
  assert.deepEqual([(await letto("piano")).nato_da, (await letto("piano/fase-1")).nato_da], [[], []]);
});

test("un citato non chiude giri, anche passando da un altro progetto; registrare toglie i citati che chiudono un giro", async () => {
  await creaProgetto(b.db, b.committente.id, "web");
  await apri(b, "s1", "a");
  await apri(b, "s2", "b");
  await apri(b, "s3", "c");
  await invia(b, evento("apri_cantiere", { nome: "x", descrizione: null, origine: "utente" }, { session_id: "s2", progetto: "web" }));
  await invia(b, evento("apri_cantiere", { nome: "a", descrizione: null, origine: "utente", nato_da: "x", nato_da_progetto: "web" }, { session_id: "s4" }));
  // a → b chiuderebbe a → b → web/x → a.
  await copia(b, { attivi: [changeAttivo("a", { "tasks.md": "- [ ] 1.1 Serve `b`" }, "2026-10-20T10:00:00Z")], archiviati: [] });
  assert.deepEqual((await letto("b")).nato_da, []);
  // a → c citato; poi c → x e x → a registrati: il citato va via, i registrati restano.
  await copia(b, { attivi: [changeAttivo("a", { "tasks.md": "- [ ] 1.1 Serve `c`" }, "2026-10-21T10:00:00Z")], archiviati: [] });
  assert.equal((await letto("c")).nato_da[0].tipo, "citato");
  await invia(b, evento("apri_cantiere", { nome: "x", descrizione: null, origine: "utente", nato_da: "c", nato_da_progetto: "app" }, { session_id: "s5", progetto: "web" }));
  assert.deepEqual((await letto("c")).nato_da, []);
});

test("un citato non rovescia un registrato: registrare al contrario toglie il citato, e la copia dopo non lo rimette", async () => {
  await apri(b, "s1", "a");
  await apri(b, "s2", "b");
  const proposta = (quando: string) => ({ attivi: [changeAttivo("a", { "proposal.md": "Usa `b`." }, quando)], archiviati: [] });
  await copia(b, proposta("2026-10-20T10:00:00Z"));
  assert.equal((await letto("b")).nato_da[0].percorso, "a");
  await invia(b, evento("apri_cantiere", { nome: "a", descrizione: null, origine: "utente", nato_da: "b" }, { session_id: "s3" }));
  await copia(b, proposta("2026-10-21T10:00:00Z"));
  assert.deepEqual((await letto("b")).nato_da, []);
  assert.deepEqual((await letto("a")).nato_da.map((n: any) => [n.percorso, n.tipo]), [["b", "registrato"]]);
});

test("progetto inesistente o di un altro committente: 404", async () => {
  assert.equal((await copia(b, vuota, "pokr")).status, 404);
  const priv = await b.altroCommittente(`PRIV${Date.now()}`, ["segreto"]);
  assert.equal((await copia(b, vuota, "segreto")).status, 404);
  assert.equal((await copia(b, vuota, "segreto", priv.token)).status, 200);
});
