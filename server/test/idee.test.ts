import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { di, TUTTI } from "../src/ambito.ts";
import { cambiaEsito } from "../src/dominio.ts";
import { aggiungiFile, creaIdea, eliminaFile, modificaIdea } from "../src/idee.ts";
import { Rifiuto } from "../src/modelli.ts";
import { avvia, cantiere, richiesta, sessione, type Banco } from "./aiuto.ts";

let b: Banco;
before(async () => (b = await avvia({ max_file: 1000, max_file_idea: 12 })));
after(() => b.chiudi());
beforeEach(async () => {
  for (const t of ["eventi", "sessioni", "cantieri", "esiti", "idee_file"] as const) await b.db.deleteFrom(t).execute();
});
const rifiutato = (f: () => Promise<unknown>, codice: number, messaggio?: RegExp) =>
  assert.rejects(f, (e) => e instanceof Rifiuto && e.codice === codice && (!messaggio || messaggio.test(e.message)));
const idea = (nome: string, altro: object = {}) => creaIdea(b, TUTTI, b.progetto.id, { nome, ...altro });
const dieciFile = async (id: number) => {
  for (let i = 1; i <= 10; i++) await aggiungiFile(b, TUTTI, id, { nome: `nota-${i}.md`, contenuto: `# Nota ${i}` });
};
const luogo = { host: "portatile", cwd: "/home/u/app", repo: null, branch: null };
const prendi = (percorso: string, session_id = "s1", token = b.token) =>
  richiesta(b, `/api/v1/progetti/app/cantieri/${percorso.split("/").map(encodeURIComponent).join("/")}/prendi`, { method: "POST", body: JSON.stringify({ session_id, ...luogo }) }, token);

test("idea sotto un progetto con 10 file; idea sotto un cantiere con il change riservato", async () => {
  const c = await idea("iDOC converter", { descrizione: "conversione dei documenti" });
  await dieciFile(c.id);
  const letta = ((await richiesta(b, "/api/v1/cantieri")).corpo.cantieri as any[]).find((x) => x.id === c.id);
  assert.deepEqual([letta.percorso, letta.stato, letta.file_idea, letta.change, letta.origine], ["iDOC converter", "idea", 10, "idoc-converter", "dashboard"]);
  const figlia = await idea("preprod", { padre_id: c.id });
  assert.deepEqual([figlia.percorso, figlia.stato, figlia.change], ["iDOC converter/preprod", "idea", "idoc-converter-preprod"]);
  assert.equal(figlia.sessioni?.length, 0);
});

test("file: solo .md e .txt in UTF-8, entro max_file e max_file_idea, l'errore nomina il file", async () => {
  const c = await idea("verifiche");
  await rifiutato(() => aggiungiFile(b, TUTTI, c.id, { nome: "schema.pdf", contenuto: "x" }), 422, /"schema.pdf".*\.md e \.txt/);
  await rifiutato(() => aggiungiFile(b, TUTTI, c.id, { nome: "grande.md", contenuto: "x".repeat(1001) }), 422, /"grande.md" supera 1000 byte/);
  await rifiutato(() => aggiungiFile(b, TUTTI, c.id, { nome: "rotto.txt", contenuto: "\ud800" }), 422, /"rotto.txt" non è testo UTF-8/);
  await rifiutato(() => aggiungiFile(b, TUTTI, c.id, { nome: "../fuori.md", contenuto: "x" }), 422);
  assert.equal((await b.db.selectFrom("idee_file").select("nome").execute()).length, 0, "l'idea resta com'era");
  await dieciFile(c.id);
  await aggiungiFile(b, TUTTI, c.id, { nome: "appunti.txt", contenuto: "riga 1\nriga 2" });
  await aggiungiFile(b, TUTTI, c.id, { nome: "dodici.md", contenuto: "x" });
  await rifiutato(() => aggiungiFile(b, TUTTI, c.id, { nome: "tredici.md", contenuto: "x" }), 422, /al massimo 12 file/);
  await aggiungiFile(b, TUTTI, c.id, { nome: "dodici.md", contenuto: "sostituito" });
  await eliminaFile(b, TUTTI, c.id, "appunti.txt");
  assert.equal((await b.db.selectFrom("idee_file").select("nome").execute()).length, 11);
});

test("modifiche solo in stato idea; un'idea con figli non si rinomina", async () => {
  const c = await idea("bozza");
  const rinominata = await modificaIdea(b, TUTTI, c.id, { nome: "Report mensile", descrizione: "numeri del mese" });
  assert.deepEqual([rinominata.nome, rinominata.change, rinominata.descrizione], ["Report mensile", "report-mensile", "numeri del mese"]);
  await idea("fase", { padre_id: c.id });
  await rifiutato(() => modificaIdea(b, TUTTI, c.id, { nome: "altro" }), 409, /con figli/);
  await prendi("report-mensile");
  await rifiutato(() => aggiungiFile(b, TUTTI, c.id, { nome: "tardi.md", contenuto: "x" }), 409, /già in lavorazione/);
  await rifiutato(() => modificaIdea(b, TUTTI, c.id, { descrizione: "x" }), 409);
});

test("prima presa: aperto, sessione con origine utente, change e file; seconda macchina: stessi dati", async () => {
  const c = await idea("idoc-converter");
  await dieciFile(c.id);
  const prima = await prendi("idoc-converter");
  assert.equal(prima.status, 200);
  assert.deepEqual([prima.corpo.change, prima.corpo.file.length, prima.corpo.cantiere.origine, prima.corpo.cantiere.stato], ["idoc-converter", 10, "utente", "aperto"]);
  assert.equal((await cantiere(b, "idoc-converter")).stato, "aperto");
  const s = await sessione(b, "s1");
  assert.deepEqual([s.cantiere_id, s.origine_associazione, s.host], [c.id, "utente", "portatile"]);
  const seconda = await prendi("idoc-converter", "s2");
  assert.deepEqual([seconda.status, seconda.corpo.change, seconda.corpo.file], [200, prima.corpo.change, prima.corpo.file]);
  assert.equal((await sessione(b, "s2")).cantiere_id, c.id);
});

test("presa di una fase: anche il padre ancora idea passa ad aperto", async () => {
  const padre = await idea("idoc-converter");
  await idea("prototipo", { padre_id: padre.id });
  assert.equal((await prendi("idoc-converter/prototipo")).corpo.change, "idoc-converter-prototipo");
  assert.equal((await cantiere(b, "idoc-converter")).stato, "aperto");
});

test("cantiere chiuso o sospeso: 409 con lo stato; inesistente o di un altro committente: 404", async () => {
  const c = await idea("vecchio");
  await cambiaEsito(b, TUTTI, c.id, "abbandona");
  const r = await prendi("vecchio");
  assert.equal(r.status, 409);
  assert.match(r.corpo.errore, /abbandonato/);
  assert.equal((await prendi("mai-visto")).status, 404);
  const priv = await b.altroCommittente(`PRIV${Date.now()}`, ["app"]);
  await idea("riservata");
  assert.equal((await prendi("riservata", "s9", priv.token)).status, 404);
  await rifiutato(() => aggiungiFile(b, di(priv.committente.id), c.id, { nome: "x.md", contenuto: "x" }), 404);
});
