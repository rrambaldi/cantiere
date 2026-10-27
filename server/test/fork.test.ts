// Fork da un task (change fork-da-task): il cantiere nuovo legato al task con il ritorno, e chiuso il fork la
// sessione che l'ha aperto torna alla partenza.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { TUTTI } from "../src/ambito.ts";
import { cambiaEsito } from "../src/dominio.ts";
import { apertura, apri, avvia, cantiere, changeAttivo, copia, evento, invia, richiesta, sessione, tsFa, type Banco } from "./aiuto.ts";

let b: Banco;
before(async () => (b = await avvia()));
after(() => b.chiudi());
beforeEach(async () => {
  for (const t of ["eventi", "sessioni", "cantieri", "esiti", "change_copie", "change_file", "legami"] as const) await b.db.deleteFrom(t).execute();
});

const TASKS = "## 2. Plugin\n\n- [x] 2.1 Fatto\n- [ ] 2.3 Esportare i binari\n  in CSV\n";
const fork = (sid: string, nome: string, task: string | null = "2.3", altro: object = {}, extra: object = {}) =>
  invia(b, evento("apri_cantiere", apertura(nome, "utente", { fork: true, ...(task ? { task } : {}), ...altro }), { session_id: sid, ...extra }));
const prompt = (sid: string) => invia(b, evento("prompt", {}, { session_id: sid }));
// La sessione che manda la copia sta nell'indirizzo: un server di prima la ignora invece di rifiutare il corpo.
const archivia = (change: string, sessionId?: string) =>
  richiesta(b, `/api/v1/progetti/app/openspec${sessionId ? `?session_id=${sessionId}` : ""}`, {
    method: "PUT", body: JSON.stringify({ attivi: [], archiviati: [{ change, archiviato_il: "2026-10-27" }] }),
  });
const quanti = async () => (await b.db.selectFrom("cantieri").select("id").execute()).length;
const dove = async (sid: string) => {
  const { cantiere_id } = await sessione(b, sid);
  return cantiere_id === null ? null : (await b.db.selectFrom("cantieri").select("nome").where("id", "=", cantiere_id).executeTakeFirstOrThrow()).nome;
};

/** La sessione nel cantiere di partenza, con il suo tasks.md copiato. */
async function partenza(sid = "s1", nome = "mappa-cantieri") {
  await apri(b, sid, nome);
  await copia(b, { attivi: [changeAttivo(nome, { "tasks.md": TASKS })], archiviati: [] });
}

test("fork da un task: nasce legato con il ritorno, la sessione ci entra e il contesto dice di scrivere il change", async () => {
  await partenza();
  const r = await fork("s1", "export-csv");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.cantiere.percorso, "export-csv");
  assert.match(r.corpo.contesto, /fork "export-csv" aperto da "mappa-cantieri", task 2\.3 «Esportare i binari in CSV»/);
  assert.match(r.corpo.contesto, /openspec\/changes\/export-csv\/ con proposal\.md e tasks\.md/);
  const l = await b.db.selectFrom("legami").selectAll().executeTakeFirstOrThrow();
  assert.deepEqual([l.da_id, l.a_id, l.tipo, l.task, l.session_id, l.ritorno],
    [(await cantiere(b, "mappa-cantieri")).id, (await cantiere(b, "export-csv")).id, "registrato", "2.3", "s1", 1]);
  assert.equal(await dove("s1"), "export-csv");
});

test("senza tasks.md copiato il task resta com'è scritto; uno che la copia non ha non blocca, e la conferma lo dice", async () => {
  await apri(b, "s1", "mappa-cantieri");
  const r = await fork("s1", "export-csv", "7.1");
  assert.equal(r.status, 200);
  assert.match(r.corpo.contesto, /task 7\.1\. Scrivi/);
  await partenza("s2", "altro");
  const assente = await fork("s2", "y", "9.9");
  assert.equal(assente.status, 200);
  assert.match(assente.corpo.contesto, /task 9\.9\. Il task 9\.9 non c'è nella copia di tasks\.md che ha il server/);
});

test("rifiuti con il motivo e niente creato: senza cantiere, senza task, nome che esiste, percorso o nato_da", async () => {
  assert.match((await fork("s9", "x")).corpo.errore, /parte dal cantiere aperto della sessione/);
  await partenza();
  await apri(b, "s2", "esistente");
  const motivi = [
    [await fork("s1", "x", null), /nasce da un task/],
    [await fork("s1", "esistente"), /"esistente" esiste già/],
    [await fork("s1", "mappa-cantieri/fase"), /niente nato_da, padre o percorso/],
    [await fork("s1", "x", "2.3", { nato_da: "esistente" }), /niente nato_da, padre o percorso/],
  ] as const;
  for (const [r, motivo] of motivi) {
    assert.equal(r.status, 409);
    assert.match(r.corpo.errore, motivo);
  }
  assert.equal(await quanti(), 2);
  assert.equal(await dove("s1"), "mappa-cantieri");
});

test("un fork arrivato dalla coda più di 5 minuti dopo il comando non parte; entro 5 minuti sì", async () => {
  await partenza();
  const vecchio = await fork("s1", "tardi", "2.3", {}, { ts: tsFa(6 * 60) });
  assert.equal(vecchio.status, 409);
  assert.match(vecchio.corpo.errore, /più di 5 minuti dopo il comando/);
  assert.equal((await fork("s1", "presto", "2.3", {}, { ts: tsFa(60) })).status, 200);
  assert.equal(await dove("s1"), "presto");
});

test("archiviato il fork, la sessione torna alla partenza: la risposta della copia lo dice, e l'avviso resta per il prompt", async () => {
  await partenza();
  await fork("s1", "export-csv");
  const r = await archivia("export-csv", "s1");
  assert.equal(r.status, 200);
  assert.match(r.corpo.contesto, /Il fork export-csv è completato: la sessione è tornata in mappa-cantieri\. Riprendi dal task 2\.3 «Esportare i binari in CSV»/);
  assert.deepEqual([r.corpo.cantiere.percorso, r.corpo.cantiere.origine], ["mappa-cantieri", "utente"]);
  assert.equal(await dove("s1"), "mappa-cantieri");
  assert.equal((await prompt("s1")).corpo.contesto, r.corpo.contesto);
  assert.equal((await prompt("s1")).corpo.contesto, null);
});

test("copia senza session_id, o di una sessione che non c'è: risposta di prima, e l'avviso arriva al prompt", async () => {
  await partenza();
  await fork("s1", "export-csv");
  assert.deepEqual(Object.keys((await archivia("mai-visto", "sconosciuta")).corpo), ["cantieri"]);
  const r = await archivia("export-csv");
  assert.deepEqual(Object.keys(r.corpo), ["cantieri"]);
  assert.match((await prompt("s1")).corpo.contesto, /tornata in mappa-cantieri/);
});

test("fork dentro un fork: si torna un livello alla volta", async () => {
  await partenza();
  await fork("s1", "f");
  await copia(b, { attivi: [changeAttivo("mappa-cantieri", { "tasks.md": TASKS }), changeAttivo("f", { "tasks.md": "- [ ] 1.1 Prima\n" })], archiviati: [] });
  await fork("s1", "g", "1.1");
  assert.match((await archivia("g", "s1")).corpo.contesto, /Il fork g è completato: la sessione è tornata in f\. Riprendi dal task 1\.1 «Prima»/);
  assert.equal(await dove("s1"), "f");
  await archivia("f", "s1");
  assert.equal(await dove("s1"), "mappa-cantieri");
});

test("fork sospeso dalla dashboard: si torna anche così; partenza chiusa nel frattempo: lavoro diretto", async () => {
  await partenza();
  await fork("s1", "f");
  await cambiaEsito(b, TUTTI, (await cantiere(b, "f")).id, "sospendi");
  assert.equal(await dove("s1"), "mappa-cantieri");
  assert.match((await prompt("s1")).corpo.contesto, /Il fork f è sospeso/);

  await fork("s1", "h");
  await cambiaEsito(b, TUTTI, (await cantiere(b, "mappa-cantieri")).id, "sospendi");
  const r = await archivia("h", "s1");
  assert.match(r.corpo.contesto, /Il cantiere h è completato: ora lavori direttamente su app/);
  assert.equal(r.corpo.cantiere, null);
  assert.equal(await dove("s1"), null);
});

test("un ramo normale, senza fork, non torna: chiuso, la sessione va al lavoro diretto", async () => {
  await partenza();
  await invia(b, evento("apri_cantiere", apertura("ramo", "utente", { task: "2.3" }), { session_id: "s1" }));
  const l = await b.db.selectFrom("legami").selectAll().executeTakeFirstOrThrow();
  assert.deepEqual([l.session_id, l.ritorno], ["s1", 0]);
  await archivia("ramo", "s1");
  assert.equal(await dove("s1"), null);
});

test("torna solo la sessione che ha aperto il fork e ci sta ancora; le altre come prima", async () => {
  await partenza();
  await fork("s1", "f");
  await apri(b, "s2", "f");
  await archivia("f");
  assert.equal(await dove("s1"), "mappa-cantieri");
  assert.equal(await dove("s2"), null);

  await fork("s1", "g");
  await apri(b, "s1", "altro");
  await archivia("g");
  assert.equal(await dove("s1"), "altro");
});
