import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { autentica, creaCommittente, elencaCommittenti, hashToken, rigeneraToken } from "../src/accesso.ts";
import { Rifiuto } from "../src/modelli.ts";
import { avvia, richiesta, type Banco } from "./aiuto.ts";

describe("committenti", () => {
  let b: Banco;
  before(async () => (b = await avvia()));
  after(() => b.chiudi());

  const rifiutato = async (f: () => Promise<unknown>, codice: number, messaggio: RegExp) => {
    await assert.rejects(f, (e) => e instanceof Rifiuto && e.codice === codice && messaggio.test(e.message));
  };

  test("creazione: token una volta sola, nel database solo l'hash", async () => {
    const { committente, token } = await creaCommittente(b.db, "DGT");
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const riga = await b.db.selectFrom("committenti").selectAll().where("id", "=", committente.id).executeTakeFirstOrThrow();
    assert.equal(riga.token_hash, hashToken(token));
    assert.ok(!JSON.stringify(riga).includes(token));
    assert.deepEqual(await autentica(b.db, `Bearer ${token}`), { id: committente.id, nome: "DGT" });
  });

  test("stesso nome con maiuscole diverse: rifiutato e nominato", () => rifiutato(() => creaCommittente(b.db, "cvstudio"), 409, /"CVSTUDIO"/));

  test("nome conservato come scritto", async () => {
    await creaCommittente(b.db, "PentaQo");
    assert.ok((await elencaCommittenti(b.db)).some((c) => c.nome === "PentaQo"));
  });

  test("nomi riservati e con barre: rifiutati, nessun committente nasce", async () => {
    const prima = (await elencaCommittenti(b.db)).length;
    await rifiutato(() => creaCommittente(b.db, "API"), 422, /riservato/);
    await rifiutato(() => creaCommittente(b.db, "PRIV/test"), 422, /lettere, cifre/);
    assert.equal((await elencaCommittenti(b.db)).length, prima);
  });

  test("elenco senza token né hash", async () => {
    const elenco = JSON.stringify(await elencaCommittenti(b.db));
    assert.ok(!elenco.includes(b.token) && !elenco.includes(hashToken(b.token)));
  });

  test("rigenerazione: il vecchio token smette subito di valere", async () => {
    const { token } = await creaCommittente(b.db, "Rigenera");
    assert.equal((await richiesta(b, "/api/v1/salute", {}, token)).status, 200);
    const nuovo = await rigeneraToken(b.db, { nome: "rigenera" });
    assert.equal((await richiesta(b, "/api/v1/salute", {}, token)).status, 401);
    assert.equal((await richiesta(b, "/api/v1/salute", {}, nuovo)).corpo.cliente, "Rigenera");
  });
});
