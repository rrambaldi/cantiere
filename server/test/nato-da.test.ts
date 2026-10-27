// «Nato da» messo e tolto dalla scheda del cantiere (mappa-cantieri, design D9).
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { apertura, apri, avvia, cantiere, changeAttivo, copia, evento, invia, richiesta, sessione, ui, type Banco } from "./aiuto.ts";

let b: Banco;
let priv: Awaited<ReturnType<Banco["altroCommittente"]>>;
before(async () => {
  b = await avvia();
  priv = await b.altroCommittente("PRIV", ["mercurius"]);
});
after(() => b.chiudi());
beforeEach(async () => {
  for (const t of ["eventi", "sessioni", "cantieri", "esiti", "change_copie", "change_file", "legami"] as const) await b.db.deleteFrom(t).execute();
});

const post = (percorso: string, corpo: object, headers: Record<string, string> = {}) => ui(b, percorso, { method: "POST", body: JSON.stringify(corpo), headers });
const metti = async (a: string, da: string | number, task?: string | null, headers?: Record<string, string>) =>
  post(`/ui/api/cantieri/${(await cantiere(b, a)).id}/nato-da`, { da: typeof da === "number" ? da : (await cantiere(b, da)).id, ...(task === undefined ? {} : { task }) }, headers);
const togli = async (a: string, da: string) => post(`/ui/api/cantieri/${(await cantiere(b, a)).id}/nato-da/togli`, { da: (await cantiere(b, da)).id });
const natoDa = async (percorso: string) =>
  ((await richiesta(b, "/api/v1/cantieri")).corpo.cantieri as any[]).find((c) => c.percorso === percorso).nato_da.map((n: any) => [n.percorso, n.task, n.tipo]);

test("messo dalla scheda: registrato, e il task dato prende il posto di quello che c'era, anche nessuno", async () => {
  await apri(b, "s1", "a");
  await apri(b, "s2", "b");
  assert.deepEqual((await metti("b", "a", "2.1")).corpo, {});
  assert.deepEqual(await natoDa("b"), [["a", "2.1", "registrato"]]);
  await metti("b", "a", "3.4");
  assert.deepEqual(await natoDa("b"), [["a", "3.4", "registrato"]]);
  await metti("b", "a");
  assert.deepEqual(await natoDa("b"), [["a", null, "registrato"]]);
  assert.equal((await b.db.selectFrom("legami").select("session_id").executeTakeFirstOrThrow()).session_id, null);
});

test("un citato tolto non torna dalle copie dopo; rimesso, torna registrato", async () => {
  await apri(b, "s1", "a");
  await apri(b, "s2", "b");
  const cita = (testo: string) => copia(b, { attivi: [changeAttivo("a", { "tasks.md": `- [ ] 1.1 ${testo} \`b\`` })], archiviati: [] });
  await cita("Serve");
  assert.deepEqual(await natoDa("b"), [["a", "1.1", "citato"]]);
  assert.deepEqual((await togli("b", "a")).corpo, {});
  assert.deepEqual(await natoDa("b"), []);
  await cita("Serve ancora");
  assert.deepEqual(await natoDa("b"), []);
  await metti("b", "a", "1.1");
  await cita("Serve sempre");
  assert.deepEqual(await natoDa("b"), [["a", "1.1", "registrato"]]);
});

test("tolto non conta nei giri: il legame opposto si può mettere", async () => {
  await apri(b, "s1", "a");
  await apri(b, "s2", "b");
  await metti("b", "a");
  assert.equal((await metti("a", "b")).status, 409);
  await togli("b", "a");
  assert.equal((await metti("a", "b")).status, 200);
  assert.deepEqual([await natoDa("a"), await natoDa("b")], [[["b", null, "registrato"]], []]);
});

test("un fork tolto non riporta la sessione alla partenza", async () => {
  await apri(b, "s1", "p");
  await invia(b, evento("apri_cantiere", apertura("f", "utente", { fork: true, task: "1.1" }), { session_id: "s1" }));
  await togli("f", "p");
  await richiesta(b, "/api/v1/progetti/app/openspec?session_id=s1", {
    method: "PUT", body: JSON.stringify({ attivi: [], archiviati: [{ change: "f", archiviato_il: "2026-10-27" }] }),
  });
  assert.equal((await sessione(b, "s1")).cantiere_id, null);
});

test("rifiuti con il motivo: sé stesso, padre o fase, giro, partenza di un altro committente, legame che non c'è, corpo sbagliato", async () => {
  await apri(b, "s1", "a/f");
  await apri(b, "s2", "b");
  for (const [x, da] of [["a", "a"], ["a/f", "a"], ["a", "a/f"]]) {
    const r = await metti(x, da);
    assert.equal(r.status, 409);
    assert.match(r.corpo.errore, /non nasce da sé stesso, da un suo padre o da una sua fase/);
  }
  await metti("b", "a");
  assert.match((await metti("a", "b")).corpo.errore, /chiuderebbe un giro/);
  await invia(b, evento("apri_cantiere", apertura("z"), { session_id: "t1", progetto: "mercurius" }), priv.token);
  const z = (await b.db.selectFrom("cantieri").select("id").where("nome", "=", "z").executeTakeFirstOrThrow()).id;
  assert.match((await metti("b", z)).corpo.errore, /Il cantiere di partenza non esiste/);
  assert.equal((await metti("b", "a", "1.1", { "x-forgia-committente": "PRIV" })).status, 404);
  const nessuno = await togli("a", "b");
  assert.equal(nessuno.status, 404);
  assert.match(nessuno.corpo.errore, /Legame inesistente/);
  assert.equal((await post(`/ui/api/cantieri/${(await cantiere(b, "b")).id}/nato-da`, { da: "a" })).status, 422);
  assert.equal((await metti("b", "a", "x".repeat(33))).status, 422);
  assert.deepEqual(await natoDa("b"), [["a", null, "registrato"]]);
});

const yaml = (data: string) => `schema: spec-driven\ncreated: ${data}\n`;

test("un tolto non fa da arco per le citazioni: non blocca un citato che senza di lui non chiude giri", async () => {
  // c è il più vecchio per created, ma nasce dopo a: i file di a si leggono prima.
  for (const [s, nome] of [["s1", "a"], ["s2", "c"], ["s3", "b"]]) await apri(b, s, nome);
  await metti("b", "a");
  await metti("c", "b");
  await togli("b", "a");
  await copia(b, {
    attivi: [
      changeAttivo("a", { ".openspec.yaml": yaml("2026-10-11"), "tasks.md": "- [ ] 1.1 Serve `b`" }),
      changeAttivo("c", { ".openspec.yaml": yaml("2026-10-10"), "tasks.md": "- [ ] 1.1 Serve `a`" }),
    ],
    archiviati: [],
  });
  assert.deepEqual([await natoDa("a"), await natoDa("b")], [[["c", "1.1", "citato"]], []]);
});

test("un tolto non fa da arco nei giri dei registrati: il citato fuori dal giro resta", async () => {
  for (const [s, nome] of [["s1", "y"], ["s2", "z"], ["s3", "x"]]) await apri(b, s, nome);
  await metti("x", "z");
  await togli("x", "z");
  await copia(b, { attivi: [changeAttivo("y", { ".openspec.yaml": yaml("2026-10-10"), "tasks.md": "- [ ] 1.1 Serve `z`" })], archiviati: [] });
  assert.deepEqual(await natoDa("z"), [["y", "1.1", "citato"]]);
  await metti("y", "x");
  assert.deepEqual(await natoDa("z"), [["y", "1.1", "citato"]]);
});
