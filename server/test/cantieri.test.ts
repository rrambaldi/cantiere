import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { RIFIUTO_PRECEDENZA } from "../src/dominio.ts";
import { avvia, evento, invia, type Banco } from "./aiuto.ts";

describe("regole sui cantieri", () => {
  let b: Banco;
  before(async () => (b = await avvia()));
  after(() => b.chiudi());
  beforeEach(async () => {
    for (const t of ["eventi", "sessioni", "cantieri"] as const) await b.db.deleteFrom(t).execute();
  });
  const avvio = (session_id: string, extra: object = {}) => invia(b, evento("session_start", { source: "startup" }, { session_id, ...extra }));
  const apri = (session_id: string, nome: string, origine: string, extra: object = {}) =>
    invia(b, evento("apri_cantiere", { nome, descrizione: "login con Logiquo", origine }, { session_id, ...extra }));
  const chiudi = (session_id: string, esito = "completato") => invia(b, evento("chiudi_cantiere", { esito, nota: null }, { session_id }));

  test("test 3: repo+branch senza cantieri aperti → provvisorio <repo>@<branch>", async () => {
    const r = await avvio("s1", { branch: "feat-x" });
    assert.equal(r.corpo.cantiere.nome, "app@feat-x");
    assert.equal(r.corpo.cantiere.origine, "auto");
    assert.equal(r.corpo.cantiere.confermato, false);
    assert.match(r.corpo.contesto, /^\[forgia\] session_id=s1\nCantiere: app@feat-x \(auto, provvisorio\)\n/);
  });

  test("test 4: seconda sessione sullo stesso repo+branch → stesso cantiere", async () => {
    const prima = await avvio("s1");
    const seconda = await avvio("s2", { host: "fisso" });
    assert.equal(seconda.corpo.cantiere.id, prima.corpo.cantiere.id);
    assert.equal(seconda.corpo.cantiere.confermato, false);
  });

  test("cartella senza git → nome della cartella", async () => {
    const r = await avvio("s1", { repo: null, branch: null, cwd: "/home/u/appunti" });
    assert.equal(r.corpo.cantiere.nome, "appunti");
  });

  test("test 5: utente poi claude → 409 e il cantiere resta quello dell'utente", async () => {
    const utente = await apri("s1", "oauth-logiquo", "utente");
    assert.deepEqual(utente.corpo.cantiere, { id: utente.corpo.cantiere.id, nome: "oauth-logiquo", percorso: "oauth-logiquo", origine: "utente", confermato: true });
    const claude = await apri("s1", "refactoring-db", "claude");
    assert.deepEqual(claude, { status: 409, corpo: { errore: RIFIUTO_PRECEDENZA } });
    const s = await b.db.selectFrom("sessioni").selectAll().where("session_id", "=", "s1").executeTakeFirstOrThrow();
    assert.equal(s.cantiere_id, utente.corpo.cantiere.id);
    const ancora = await apri("s1", "altro", "utente");
    assert.equal(ancora.corpo.cantiere.nome, "altro", "l'utente può cambiare idea");
  });

  test("claude corregge il provvisorio", async () => {
    await avvio("s1");
    const r = await apri("s1", "migrazione-db", "claude");
    assert.deepEqual([r.corpo.cantiere.nome, r.corpo.cantiere.origine, r.corpo.cantiere.confermato], ["migrazione-db", "claude", true]);
  });

  test("test 6: stesso slug da due macchine e due repo → cantiere condiviso", async () => {
    const portatile = await apri("s1", "OAuth Logiquo", "utente");
    const fisso = await apri("s2", "oauth-logiquo", "claude", { host: "fisso", repo: "github.com/org/altro" });
    assert.equal(fisso.corpo.cantiere.id, portatile.corpo.cantiere.id);
    assert.equal(fisso.corpo.cantiere.confermato, true);
    const c = await b.db.selectFrom("cantieri").selectAll().executeTakeFirstOrThrow();
    assert.deepEqual([c.nome, c.descrizione, c.origine], ["OAuth Logiquo", "login con Logiquo", "utente"]);
  });

  test("test 10: chiusura per tutte le sessioni, poi prompt → nuovo provvisorio", async () => {
    const aperto = await apri("s1", "oauth-logiquo", "utente");
    await apri("s2", "oauth-logiquo", "claude", { host: "fisso" });
    const chiusura = await chiudi("s1");
    assert.equal(chiusura.corpo.cantiere, null);
    const sessioni = await b.db.selectFrom("sessioni").select("cantiere_id").execute();
    assert.ok(sessioni.every((s) => s.cantiere_id === null));
    const prompt = await invia(b, evento("prompt", {}, { session_id: "s2" }));
    assert.equal(prompt.corpo.cantiere.nome, "app@main");
    assert.notEqual(prompt.corpo.cantiere.id, aperto.corpo.cantiere.id);
    const vecchio = await b.db.selectFrom("cantieri").selectAll().where("id", "=", aperto.corpo.cantiere.id).executeTakeFirstOrThrow();
    assert.deepEqual([vecchio.stato, vecchio.esito], ["chiuso", "completato"]);
  });

  test("slug di nuovo libero dopo la chiusura", async () => {
    const primo = await apri("s1", "oauth-logiquo", "utente");
    await chiudi("s1", "sospeso");
    const secondo = await apri("s1", "oauth-logiquo", "utente");
    assert.notEqual(secondo.corpo.cantiere.id, primo.corpo.cantiere.id);
    assert.equal((await b.db.selectFrom("cantieri").select("id").execute()).length, 2);
  });

  test("chiusura senza cantiere: 200, cantiere null, niente cambia", async () => {
    const r = await chiudi("vuota");
    assert.equal(r.status, 200);
    assert.equal(r.corpo.cantiere, null);
    assert.equal((await b.db.selectFrom("cantieri").select("id").execute()).length, 0);
  });
});

describe("cantieri padre e figli", () => {
  let b: Banco;
  before(async () => (b = await avvia()));
  after(() => b.chiudi());
  beforeEach(async () => {
    for (const t of ["eventi", "sessioni", "cantieri"] as const) await b.db.deleteFrom(t).execute();
  });
  const apri = (session_id: string, nome: string, extra: object = {}) =>
    invia(b, evento("apri_cantiere", { nome, descrizione: null, origine: "utente", ...extra }, { session_id }));
  const chiudi = (session_id: string, dati: object = {}) =>
    invia(b, evento("chiudi_cantiere", { esito: "completato", nota: null, ...dati }, { session_id }));
  const cantiere = (nome: string) => b.db.selectFrom("cantieri").selectAll().where("nome", "=", nome).executeTakeFirstOrThrow();
  const quanti = async () => (await b.db.selectFrom("cantieri").select("id").execute()).length;

  test("nome a percorso: crea padre e figlio, la sessione va nel figlio", async () => {
    const r = await apri("s1", "logiquo-v2/oauth");
    assert.equal(r.status, 200);
    assert.deepEqual([r.corpo.cantiere.nome, r.corpo.cantiere.percorso], ["oauth", "logiquo-v2/oauth"]);
    const [padre, figlio] = [await cantiere("logiquo-v2"), await cantiere("oauth")];
    assert.deepEqual([padre.padre_id, figlio.padre_id, padre.origine], [null, padre.id, "utente"]);
    const s = await b.db.selectFrom("sessioni").select("cantiere_id").where("session_id", "=", "s1").executeTakeFirstOrThrow();
    assert.equal(s.cantiere_id, figlio.id);
  });

  test("campo padre: come il nome a percorso; un figlio si trova anche solo per nome", async () => {
    const r = await apri("s1", "oauth", { padre: "logiquo-v2" });
    assert.equal(r.corpo.cantiere.percorso, "logiquo-v2/oauth");
    const altra = await apri("s2", "oauth");
    assert.deepEqual([altra.corpo.cantiere.id, altra.corpo.cantiere.percorso], [r.corpo.cantiere.id, "logiquo-v2/oauth"]);
  });

  test("segmento vuoto: 422", async () => assert.equal((await apri("s1", "logiquo-v2//oauth")).status, 422));

  test("un cantiere aperto senza padre prende quello del percorso", async () => {
    const prima = await apri("s1", "oauth");
    const dopo = await apri("s1", "logiquo-v2/oauth");
    assert.deepEqual([dopo.corpo.cantiere.id, dopo.corpo.cantiere.percorso], [prima.corpo.cantiere.id, "logiquo-v2/oauth"]);
  });

  test("padre diverso: 409 che nomina il padre attuale, niente cambia", async () => {
    await apri("s1", "logiquo-v2/oauth");
    const r = await apri("s2", "altro/oauth");
    assert.equal(r.status, 409);
    assert.match(r.corpo.errore, /"oauth" è già figlio di "logiquo-v2"/);
    assert.equal(await quanti(), 2, "altro non viene creato");
    assert.equal((await b.db.selectFrom("sessioni").selectAll().where("session_id", "=", "s2").executeTakeFirstOrThrow()).cantiere_id, null);
  });

  test("ciclo e nome ripetuto nel percorso: 409, niente cambia", async () => {
    await apri("s1", "logiquo-v2/oauth");
    const ciclo = await apri("s1", "oauth/logiquo-v2");
    assert.equal(ciclo.status, 409);
    assert.match(ciclo.corpo.errore, /antenato di sé stesso/);
    assert.equal((await apri("s1", "nuovo/nuovo")).status, 409);
    assert.equal(await quanti(), 2);
    assert.equal((await cantiere("logiquo-v2")).padre_id, null);
  });

  test("padre con figli aperti: 409 che nomina i figli, tutti restano aperti", async () => {
    await apri("s1", "logiquo-v2/oauth");
    await apri("s2", "logiquo-v2");
    const r = await chiudi("s2");
    assert.equal(r.status, 409);
    assert.match(r.corpo.errore, /figli aperti: oauth/);
    assert.deepEqual([(await cantiere("logiquo-v2")).stato, (await cantiere("oauth")).stato], ["aperto", "aperto"]);
  });

  test("chiusura forzata: tutti i discendenti con lo stesso esito, sessioni senza cantiere", async () => {
    await apri("s1", "logiquo-v2/oauth/token");
    await apri("s2", "logiquo-v2");
    const r = await chiudi("s2", { esito: "sospeso", forza: true });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.cantiere, null);
    for (const nome of ["logiquo-v2", "oauth", "token"]) {
      const c = await cantiere(nome);
      assert.deepEqual([c.stato, c.esito], ["chiuso", "sospeso"], nome);
    }
    const sessioni = await b.db.selectFrom("sessioni").select("cantiere_id").execute();
    assert.ok(sessioni.every((s) => s.cantiere_id === null));
  });

  test("chiudere un figlio lascia aperto il padre; i provvisori non hanno padre", async () => {
    await apri("s1", "logiquo-v2/oauth");
    assert.equal((await chiudi("s1")).status, 200);
    assert.deepEqual([(await cantiere("oauth")).stato, (await cantiere("logiquo-v2")).stato], ["chiuso", "aperto"]);
    const auto = await invia(b, evento("prompt", {}, { session_id: "s3", branch: "feat-x" }));
    assert.deepEqual([auto.corpo.cantiere.origine, auto.corpo.cantiere.percorso], ["auto", "app@feat-x"]);
    assert.equal((await cantiere("app@feat-x")).padre_id, null);
  });
});
