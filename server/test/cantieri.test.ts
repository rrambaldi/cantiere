import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { TUTTI } from "../src/ambito.ts";
import { cambiaEsito, RIFIUTO_PRECEDENZA } from "../src/dominio.ts";
import { creaIdea } from "../src/idee.ts";
import { Rifiuto } from "../src/modelli.ts";
import { apri, avvia, cantiere, evento, invia, sessione, type Banco } from "./aiuto.ts";

let b: Banco;
before(async () => (b = await avvia()));
after(() => b.chiudi());
beforeEach(async () => {
  for (const t of ["eventi", "sessioni", "cantieri", "esiti", "idee_file"] as const) await b.db.deleteFrom(t).execute();
});
const quanti = async () => (await b.db.selectFrom("cantieri").select("id").execute()).length;
const esito = (id: number, azione: "sospendi" | "riattiva" | "abbandona") => cambiaEsito(b, TUTTI, id, azione);

describe("apertura per percorso dentro il progetto", () => {
  test("nome a percorso: crea padre e figlio aperti, con i change dal percorso; la sessione va nel figlio", async () => {
    const r = await apri(b, "s1", "idoc-converter/prototipo");
    assert.equal(r.status, 200);
    assert.deepEqual([r.corpo.cantiere.nome, r.corpo.cantiere.percorso, r.corpo.cantiere.change], ["prototipo", "idoc-converter/prototipo", "idoc-converter-prototipo"]);
    const [padre, figlio] = [await cantiere(b, "idoc-converter"), await cantiere(b, "idoc-converter/prototipo")];
    assert.deepEqual([padre.padre_id, padre.change, padre.stato, padre.origine], [null, "idoc-converter", "aperto", "utente"]);
    assert.deepEqual([figlio.padre_id, figlio.stato], [padre.id, "aperto"]);
    assert.equal((await sessione(b)).cantiere_id, figlio.id);
  });

  test("campo padre: come il nome a percorso", async () => {
    const r = await invia(b, evento("apri_cantiere", { nome: "prototipo", descrizione: null, origine: "utente", padre: "idoc-converter" }));
    assert.equal(r.corpo.cantiere.percorso, "idoc-converter/prototipo");
  });

  test("figlio cercato per nome: senza padre si intende il primo livello", async () => {
    const figlio = await apri(b, "s1", "idoc-converter/prototipo");
    const altro = await apri(b, "s2", "prototipo");
    assert.notEqual(altro.corpo.cantiere.id, figlio.corpo.cantiere.id);
    assert.equal(altro.corpo.cantiere.percorso, "prototipo");
  });

  test("segmento vuoto: 422", async () => assert.equal((await apri(b, "s1", "idoc-converter//prototipo")).status, 422));

  test("stesso nome sotto padri diversi: cantieri distinti; tra fratelli: lo stesso", async () => {
    const a = await apri(b, "s1", "idoc-converter/preprod");
    const c = await apri(b, "s2", "export-pdf/preprod");
    assert.notEqual(a.corpo.cantiere.id, c.corpo.cantiere.id);
    const fratello = await apri(b, "s3", "idoc-converter/Preprod");
    assert.equal(fratello.corpo.cantiere.id, a.corpo.cantiere.id);
    assert.equal(await quanti(), 4);
  });

  test("due macchine sullo stesso cantiere, confronto sullo slug", async () => {
    const portatile = await apri(b, "s1", "PDF converter");
    const fisso = await apri(b, "s2", "pdf-converter", "claude", { host: "fisso" });
    assert.equal(fisso.corpo.cantiere.id, portatile.corpo.cantiere.id);
    const c = await cantiere(b, "pdf-converter");
    assert.deepEqual([c.nome, c.change, c.origine], ["PDF converter", "pdf-converter", "utente"]);
  });

  test("nome di change già preso: 409 che nomina il cantiere, niente creato", async () => {
    await apri(b, "s1", "idoc-converter-preprod");
    const r = await apri(b, "s2", "idoc-converter/preprod");
    assert.equal(r.status, 409);
    assert.match(r.corpo.errore, /change "idoc-converter-preprod" è già del cantiere "idoc-converter-preprod"/);
    assert.equal(await quanti(), 1);
  });

  test("cantiere esistente al primo livello: un percorso non gli cambia padre", async () => {
    const primo = await apri(b, "s1", "bozza");
    const r = await apri(b, "s2", "report/bozza");
    assert.notEqual(r.corpo.cantiere.id, primo.corpo.cantiere.id);
    assert.equal((await cantiere(b, "bozza")).padre_id, null);
    assert.deepEqual([(await cantiere(b, "report")).change, (await cantiere(b, "report/bozza")).change], ["report", "report-bozza"]);
  });

  test("un antenato in stato idea passa ad aperto; un percorso che indica un'idea è rifiutato", async () => {
    const idea = await creaIdea(b, TUTTI, b.progetto.id, { nome: "piano" });
    const sullIdea = await apri(b, "s1", "piano");
    assert.equal(sullIdea.status, 409);
    assert.match(sullIdea.corpo.errore, /\/cantiere prendi piano/);
    assert.equal((await cantiere(b, "piano")).stato, "idea");
    const fase = await apri(b, "s1", "piano/fase-1");
    assert.equal(fase.status, 200);
    assert.equal((await cantiere(b, "piano")).id, idea.id);
    assert.equal((await cantiere(b, "piano")).stato, "aperto");
  });

  test("precedenza: utente poi claude → 409, l'utente può cambiare idea, claude sceglie per il lavoro diretto", async () => {
    const utente = await apri(b, "s1", "pdfconverter");
    const claude = await apri(b, "s1", "refactoring-db", "claude");
    assert.deepEqual(claude, { status: 409, corpo: { errore: RIFIUTO_PRECEDENZA } });
    assert.equal((await sessione(b)).cantiere_id, utente.corpo.cantiere.id);
    assert.equal((await apri(b, "s1", "altro")).corpo.cantiere.nome, "altro");
    const diretto = await apri(b, "s2", "migrazione-db", "claude");
    assert.deepEqual([diretto.corpo.cantiere.nome, diretto.corpo.cantiere.origine], ["migrazione-db", "claude"]);
  });

  test("sospeso e chiusi non si aprono: il motivo lo dice", async () => {
    const r = await apri(b, "s1", "export-pdf");
    await esito(r.corpo.cantiere.id, "sospendi");
    const sospeso = await apri(b, "s1", "export-pdf", "claude");
    assert.equal(sospeso.status, 409);
    assert.match(sospeso.corpo.errore, /sospeso: si riattiva dalla dashboard/);
    await esito(r.corpo.cantiere.id, "abbandona");
    assert.match((await apri(b, "s1", "export-pdf")).corpo.errore, /abbandonato: un cantiere chiuso non si riapre/);
  });
});

describe("stati ed esiti dalla dashboard", () => {
  const rifiutato = (f: () => Promise<unknown>, codice: number) => assert.rejects(f, (e) => e instanceof Rifiuto && e.codice === codice);
  const storico = async (id: number) => (await b.db.selectFrom("esiti").select(["stato", "da"]).where("cantiere_id", "=", id).orderBy("id").execute()).map((e) => `${e.stato}:${e.da}`);

  test("sospeso e riattivato: torna aperto, lo storico ha le due date", async () => {
    const { id } = (await apri(b, "s1", "export-pdf")).corpo.cantiere;
    await esito(id, "sospendi");
    const [letto] = await esito(id, "riattiva");
    assert.equal(letto.stato, "aperto");
    assert.deepEqual(await storico(id), ["aperto:utente", "sospeso:dashboard", "aperto:dashboard"]);
  });

  test("transizioni vietate: 409, completato non si riapre", async () => {
    const { id } = (await apri(b, "s1", "export-pdf")).corpo.cantiere;
    await rifiutato(() => esito(id, "riattiva"), 409);
    await b.db.updateTable("cantieri").set({ stato: "completato" }).where("id", "=", id).execute();
    await rifiutato(() => esito(id, "riattiva"), 409);
    assert.equal((await cantiere(b, "export-pdf")).stato, "completato");
    await rifiutato(() => esito(9999, "sospendi"), 404);
  });

  test("abbandono di un padre: abbandona i discendenti non finali", async () => {
    await apri(b, "s1", "idoc-converter/prototipo");
    await apri(b, "s2", "idoc-converter/preprod");
    const prototipo = await cantiere(b, "idoc-converter/prototipo");
    await b.db.updateTable("cantieri").set({ stato: "completato" }).where("id", "=", prototipo.id).execute();
    const toccati = await esito((await cantiere(b, "idoc-converter")).id, "abbandona");
    assert.deepEqual(toccati.map((c) => c.percorso).sort(), ["idoc-converter", "idoc-converter/preprod"]);
    assert.deepEqual(
      [(await cantiere(b, "idoc-converter")).stato, (await cantiere(b, "idoc-converter/preprod")).stato, (await cantiere(b, "idoc-converter/prototipo")).stato],
      ["abbandonato", "abbandonato", "completato"],
    );
  });

  test("sessioni di un cantiere sospeso: lavoro diretto, avviso al primo prompt", async () => {
    const { id } = (await apri(b, "s1", "export-pdf")).corpo.cantiere;
    await esito(id, "sospendi");
    const prompt = await invia(b, evento("prompt", {}));
    assert.equal(prompt.corpo.cantiere, null);
    assert.equal(prompt.corpo.contesto, "[forgia] Il cantiere export-pdf è sospeso: ora lavori direttamente su app. Dillo all'utente in una riga.");
    assert.equal((await invia(b, evento("prompt", {}))).corpo.contesto, null);
  });
});
