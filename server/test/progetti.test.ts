import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { creaProgetto, elencaProgetti } from "../src/dominio.ts";
import { di } from "../src/ambito.ts";
import { Rifiuto } from "../src/modelli.ts";
import { avvia, evento, invia, richiesta, type Banco } from "./aiuto.ts";

describe("progetti", () => {
  let b: Banco;
  let priv: Awaited<ReturnType<Banco["altroCommittente"]>>;
  before(async () => {
    b = await avvia();
    priv = await b.altroCommittente("PRIV", ["monitor"]);
  });
  after(() => b.chiudi());

  test("stesso nome in committenti diversi: due progetti distinti", async () => {
    const dgt = await b.altroCommittente("DGT", []);
    const monitor = await creaProgetto(b.db, dgt.committente.id, "monitor");
    const delPriv = (await elencaProgetti(b.db, di(priv.committente.id))).find((p) => p.nome === "monitor")!;
    assert.notEqual(monitor.id, delPriv.id);
  });

  test("nome già usato nel committente, confrontato sullo slug", async () => {
    await creaProgetto(b.db, b.committente.id, "poker");
    await assert.rejects(() => creaProgetto(b.db, b.committente.id, "Poker"), (e) => e instanceof Rifiuto && e.codice === 409 && /"poker"/.test(e.message));
  });

  test("API: crea ed elenca con i conteggi per stato; un altro committente non li vede", async () => {
    const creato = await richiesta(b, "/api/v1/progetti", { method: "POST", body: JSON.stringify({ nome: "mercurius" }) });
    assert.equal(creato.status, 200);
    assert.deepEqual(Object.keys(creato.corpo.progetto).sort(), ["cantieri", "creato_il", "id", "nome", "slug"]);
    await invia(b, evento("apri_cantiere", { nome: "tassi", descrizione: null, origine: "utente" }, { progetto: "mercurius" }));
    const { progetti } = (await richiesta(b, "/api/v1/progetti")).corpo;
    const mercurius = progetti.find((p: { nome: string }) => p.nome === "mercurius");
    assert.deepEqual(mercurius.cantieri, { idea: 0, aperto: 1, sospeso: 0, completato: 0, abbandonato: 0 });
    const delPriv = (await richiesta(b, "/api/v1/progetti", {}, priv.token)).corpo.progetti.map((p: { nome: string }) => p.nome);
    assert.deepEqual(delPriv, ["monitor"]);
    const doppio = await richiesta(b, "/api/v1/progetti", { method: "POST", body: JSON.stringify({ nome: "Mercurius" }) });
    assert.equal(doppio.status, 409);
    assert.equal((await richiesta(b, "/api/v1/progetti", { method: "POST", body: JSON.stringify({ nome: "a/b" }) })).status, 422);
  });

  test("un evento su un progetto inesistente: 422 e niente creato", async () => {
    const r = await invia(b, evento("session_start", { source: "startup" }, { progetto: "pokr", session_id: "x1" }));
    assert.equal(r.status, 422);
    assert.match(r.corpo.errore, /"pokr" non esiste/);
    assert.equal((await b.db.selectFrom("progetti").select("id").where("slug", "=", "pokr").execute()).length, 0);
    assert.equal((await b.db.selectFrom("eventi").select("id").where("session_id", "=", "x1").execute()).length, 0);
    assert.equal((await b.db.selectFrom("sessioni").select("session_id").where("session_id", "=", "x1").execute()).length, 0);
  });
});
