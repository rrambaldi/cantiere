import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { migrazioniMancanti } from "../src/db.ts";
import { pulizia } from "../src/dominio.ts";
import { apri, avvia, evento, invia, richiesta, stop, tsFa, ui, type Banco } from "./aiuto.ts";

const domanda = (id: string, extra: object = {}) => ({ id, tipo: "scelta", testo: "Quale branch?", opzioni: ["main", "dev"], ...extra });

describe("domande in attesa", () => {
  let b: Banco;
  before(async () => {
    b = await avvia();
  });
  after(() => b.chiudi());
  beforeEach(async () => {
    for (const t of ["eventi", "sessioni", "cantieri", "domande", "esiti"] as const) await b.db.deleteFrom(t).execute();
  });
  const inAttesa = () => b.db.selectFrom("domande").selectAll().where("stato", "=", "in_attesa").execute();
  const cantieri = async () => (await richiesta(b, "/api/v1/cantieri")).corpo.cantieri as any[];

  test("migrazione: un database già migrato non ne ha da fare", async () => {
    assert.deepEqual(await migrazioniMancanti(b.db), []);
  });

  test("validazione: 422 per tipo, id mancante, troppe opzioni e testo lungo", async () => {
    const senzaId = { tipo: "scelta", testo: "x", opzioni: [] };
    const casi = [
      evento("domanda", domanda("d1", { tipo: "urgente" })),
      evento("domanda", senzaId),
      evento("domanda", domanda("d1", { opzioni: Array.from({ length: 11 }, (_, i) => `o${i}`) })),
      evento("domanda", domanda("d1", { testo: "x".repeat(4001) })),
      evento("risposta", {}),
    ];
    for (const ev of casi) assert.equal((await invia(b, ev)).status, 422, JSON.stringify(ev).slice(0, 80));
    assert.deepEqual(await inAttesa(), []);
  });

  test("domanda a scelta e sessione ferma: registrate con testo, opzioni e host; ripetuta una volta sola", async () => {
    assert.equal((await invia(b, evento("domanda", domanda("d1")))).status, 200);
    assert.equal((await invia(b, evento("domanda", domanda("d1")))).status, 200); // altro evento_id, stesso id
    assert.equal((await invia(b, evento("domanda", { id: "n1", tipo: "attesa", testo: "Claude ha bisogno del tuo permesso", opzioni: [] }))).status, 200);
    const righe = await inAttesa();
    assert.deepEqual(righe.map((r) => [r.domanda_id, r.tipo, r.host]), [["d1", "scelta", "portatile"], ["n1", "attesa", "portatile"]]);
    assert.deepEqual(JSON.parse(righe[0].opzioni), ["main", "dev"]);
  });

  test("chiusura: risposta, nuovo prompt, stop (solo attesa), fine sessione; id sconosciuto ignorato", async () => {
    await invia(b, evento("domanda", domanda("d1", { id: "d1" }), { ts: tsFa(10) }));
    assert.equal((await invia(b, evento("risposta", { id: "ignoto" }))).status, 200);
    assert.equal((await inAttesa()).length, 1);
    await invia(b, evento("risposta", { id: "d1" }));
    assert.deepEqual((await b.db.selectFrom("domande").select("stato").execute()).map((r) => r.stato), ["risposta"]);

    await b.db.deleteFrom("domande").execute();
    await invia(b, evento("domanda", domanda("d2"), { ts: tsFa(10) }));
    await invia(b, evento("domanda", { id: "n2", tipo: "attesa", testo: "ferma", opzioni: [] }, { ts: tsFa(10) }));
    await invia(b, evento("stop", stop()));
    assert.deepEqual((await inAttesa()).map((r) => r.domanda_id), ["d2"]); // lo stop chiude solo l'attesa
    await invia(b, evento("prompt", {}));
    assert.deepEqual(await inAttesa(), []);

    await invia(b, evento("domanda", domanda("d3"), { ts: tsFa(10) }));
    await invia(b, evento("session_end", { reason: "other", titolo: null }));
    assert.deepEqual(await inAttesa(), []);
  });

  test("un prompt in ritardo non chiude una domanda nata dopo di lui", async () => {
    await invia(b, evento("domanda", domanda("d1"), { ts: tsFa(0) }));
    await invia(b, evento("prompt", {}, { ts: tsFa(30) }));
    assert.deepEqual((await inAttesa()).map((r) => r.domanda_id), ["d1"]);
  });

  test("scadenza: dopo 24 ore non compare e non conta; la pulizia la toglie oltre la retention", async () => {
    await apri(b, "s1", "nis2");
    await invia(b, evento("domanda", domanda("d1"), { ts: tsFa(25 * 3600) }));
    const [c] = await cantieri();
    assert.deepEqual([c.domande_in_attesa, c.domande], [0, []]);
    await b.db.insertInto("domande").values({ domanda_id: "v", session_id: "s1", tipo: "scelta", testo: "t", opzioni: "[]", host: "h", ts: tsFa(200 * 86400), stato: "chiusa", chiusa_il: null }).execute();
    const r = await pulizia(b);
    assert.equal(r.domande, 1);
    assert.equal((await b.db.selectFrom("domande").select("id").execute()).length, 1);
  });

  test("letture: conteggio verso i padri, elenco proprio, sessione senza cantiere conta per il progetto", async () => {
    await apri(b, "s1", "nis2/criteri");
    await apri(b, "s2", "nis2/criteri");
    await invia(b, evento("domanda", domanda("a"), { session_id: "s1" }));
    await invia(b, evento("domanda", domanda("b", { testo: "Procedo?", opzioni: [] }), { session_id: "s2" }));
    await invia(b, evento("domanda", domanda("c"), { session_id: "s3" })); // lavoro diretto
    const tutti = await cantieri();
    const figlio = tutti.find((c) => c.percorso === "nis2/criteri");
    const padre = tutti.find((c) => c.percorso === "nis2");
    assert.deepEqual([figlio.domande_in_attesa, figlio.domande.map((d: any) => d.id).sort()], [2, ["a", "b"]]);
    assert.deepEqual([padre.domande_in_attesa, padre.domande], [2, []]);
    assert.deepEqual(Object.keys(figlio.domande[0]).sort(), ["eta_secondi", "host", "id", "opzioni", "session_id", "testo", "tipo", "ts"]);
    const progetto = (await richiesta(b, "/api/v1/progetti")).corpo.progetti.find((p: any) => p.nome === "app");
    assert.equal(progetto.domande_in_attesa, 3);
    const albero = (await ui(b, "/ui/api/albero")).corpo.committenti[0].progetti.find((p: any) => p.nome === "app");
    assert.equal(albero.domande_in_attesa, 3);
  });

  test("la domanda di una sessione senza cantiere sta nella sua riga delle non censite", async () => {
    await apri(b, "s1", "nis2");
    await invia(b, evento("domanda", domanda("a"), { session_id: "s1" }));
    await invia(b, evento("domanda", domanda("c"), { session_id: "s3" }));
    await invia(b, evento("prompt", {}, { session_id: "s4" }));
    const progetto = (await ui(b, "/ui/api/albero")).corpo.committenti[0].progetti.find((p: any) => p.nome === "app");
    const sciolte = (await ui(b, `/ui/api/progetti/${progetto.id}/non-censite`)).corpo.sessioni as any[];
    assert.deepEqual(sciolte.map((s) => [s.session_id, s.domande.map((d: any) => d.testo)]).sort(), [["s3", ["Quale branch?"]], ["s4", []]]);
  });

  test("le domande di un altro committente non si vedono", async () => {
    const altro = await b.altroCommittente("PRIV", ["app"]);
    await invia(b, evento("domanda", domanda("x"), { session_id: "p1" }), altro.token);
    const mie = (await richiesta(b, "/api/v1/progetti")).corpo.progetti.find((p: any) => p.nome === "app");
    assert.equal(mie.domande_in_attesa, 0);
  });

  test("nessuna rotta per rispondere dalla dashboard", async () => {
    await invia(b, evento("domanda", domanda("d1")));
    for (const [metodo, percorso] of [["POST", "/api/v1/domande/d1/risposta"], ["POST", "/ui/api/domande/1/risposta"]] as const) {
      const r = metodo === "POST" && percorso.startsWith("/ui") ? await ui(b, percorso, { method: "POST", body: "{}" }) : await richiesta(b, percorso, { method: "POST", body: "{}" });
      assert.equal(r.status, 404, percorso);
    }
    assert.equal((await inAttesa()).length, 1);
  });

  test("il testo delle domande non finisce nei log", async () => {
    await invia(b, evento("domanda", domanda("d1", { testo: "TESTO-SEGRETO-DELLA-DOMANDA" })));
    assert.ok(!JSON.stringify(b.log).includes("TESTO-SEGRETO"));
  });
});
