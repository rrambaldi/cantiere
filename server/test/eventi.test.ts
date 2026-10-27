import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { creaProgetto } from "../src/dominio.ts";
import { apri, avvia, evento, invia, richiesta, sessione, stop, tsFa, type Banco } from "./aiuto.ts";

describe("eventi", () => {
  let b: Banco;
  before(async () => {
    b = await avvia();
    await creaProgetto(b.db, b.committente.id, "admin");
  });
  after(() => b.chiudi());
  beforeEach(async () => {
    for (const t of ["eventi", "sessioni", "cantieri", "todo", "esiti"] as const) await b.db.deleteFrom(t).execute();
  });
  const quantiEventi = async () => (await b.db.selectFrom("eventi").select("id").execute()).length;

  test("validazione v2: 422 e niente salvato", async () => {
    const { progetto, ...senzaProgetto } = evento("prompt", {});
    const casi = [
      evento("compila", {}),
      evento("chiudi_cantiere", { esito: "completato", nota: null }),
      senzaProgetto,
      evento("apri_cantiere", { nome: "x", descrizione: null, origine: "dashboard" }),
      { ...evento("prompt", {}), extra: 1 },
      evento("prompt", { testo: "il prompt non va mai inviato" }),
      evento("apri_cantiere", { nome: "x".repeat(81), descrizione: null, origine: "utente" }),
      evento("todo", { strumento: "TodoWrite", completo: true, todos: [{ id: null, testo: "x".repeat(501), stato: "pending" }] }),
      evento("stop", stop("x".repeat(201))),
      evento("stop", { strumenti_nel_turno: 0, resoconto_inviato: false, bloccato: false }),
      evento("prompt", {}, { ts: "ieri" }),
    ];
    for (const ev of casi) assert.equal((await invia(b, ev)).status, 422, JSON.stringify(ev).slice(0, 90));
    const nonJson = await richiesta(b, "/api/v1/eventi", { method: "POST", body: "{non json" });
    assert.equal(nonJson.status, 422);
    assert.equal(await quantiEventi(), 0);
  });

  test("forma della risposta: progetto, cantiere null nel lavoro diretto, contesto, config, comandi vuoti", async () => {
    const r = await invia(b, evento("session_start", { source: "startup" }));
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.corpo).sort(), ["cantiere", "comandi", "config", "contesto", "progetto"]);
    assert.deepEqual([r.corpo.progetto, r.corpo.cantiere, r.corpo.comandi], ["app", null, []]);
    assert.deepEqual(r.corpo.config, { modalita_resoconto: "forzato", soglia_strumenti: 3 });
    const aperto = await apri(b, "s1", "pdfconverter");
    assert.deepEqual(Object.keys(aperto.corpo.cantiere).sort(), ["change", "id", "nome", "origine", "percorso", "stato"]);
    assert.deepEqual(
      { ...aperto.corpo.cantiere, id: 0 },
      { id: 0, nome: "pdfconverter", percorso: "pdfconverter", origine: "utente", stato: "aperto", change: "pdfconverter" },
    );
  });

  test("subagenti: contati per tipo nella sessione e mostrati con le sessioni del cantiere; nessun altro testo", async () => {
    await apri(b, "s1", "pdfconverter");
    for (const tipo of ["Explore", "Explore", "general-purpose"]) assert.equal((await invia(b, evento("subagente", { tipo }))).status, 200);
    assert.deepEqual(JSON.parse((await sessione(b)).subagenti), { Explore: 2, "general-purpose": 1 });
    const [c] = (await richiesta(b, "/api/v1/cantieri")).corpo.cantieri;
    assert.deepEqual(c.sessioni[0].subagenti, { Explore: 2, "general-purpose": 1 });
    assert.equal((await invia(b, evento("subagente", { tipo: "Explore", prompt: "segreto" }))).status, 422);
    for (const tipo of ["constructor", "constructor", "toString"]) await invia(b, evento("subagente", { tipo }));
    assert.deepEqual(JSON.parse((await sessione(b)).subagenti), { Explore: 2, "general-purpose": 1, constructor: 2, toString: 1 });
  });

  test("idempotenza: stesso evento_id, un evento, stessa risposta, un turno", async () => {
    const ev = evento("prompt", {});
    const prima = await invia(b, ev);
    const seconda = await invia(b, ev);
    assert.deepEqual(seconda, prima);
    assert.equal(await quantiEventi(), 1);
    assert.equal((await sessione(b)).turni, 1);
  });

  test("sessione creata al volo da un todo: lavoro diretto sul progetto, todo applicato", async () => {
    const r = await invia(b, evento("todo", { strumento: "TodoWrite", completo: true, todos: [{ id: null, testo: "a", stato: "pending" }] }, { session_id: "nuova" }));
    assert.equal(r.status, 200);
    const s = await sessione(b, "nuova");
    assert.deepEqual([s.progetto_id, s.cantiere_id, s.committente_id], [b.progetto.id, null, b.committente.id]);
    assert.equal((await b.db.selectFrom("todo").select("testo").where("session_id", "=", "nuova").execute()).length, 1);
  });

  test("un evento con un altro progetto sposta la sessione, in lavoro diretto", async () => {
    await apri(b, "s1", "pdfconverter");
    const r = await invia(b, evento("prompt", {}, { progetto: "admin" }));
    assert.deepEqual([r.corpo.progetto, r.corpo.cantiere], ["admin", null]);
    const s = await sessione(b);
    assert.deepEqual([s.cantiere_id, s.origine_associazione], [null, null]);
  });

  test("titolo della sessione: resta l'ultimo non null", async () => {
    await invia(b, evento("stop", stop("fix login mobile")));
    await invia(b, evento("stop", stop(null)));
    assert.equal((await sessione(b)).titolo, "fix login mobile");
    await invia(b, evento("session_end", { reason: "other", titolo: "fix login e test" }));
    assert.equal((await sessione(b)).titolo, "fix login e test");
  });

  test("ciclo session_start → prompt → stop → session_end → prompt", async () => {
    await invia(b, evento("session_start", { source: "startup" }));
    assert.equal((await sessione(b)).stato, "attiva");
    await invia(b, evento("prompt", {}));
    assert.deepEqual([(await sessione(b)).stato, (await sessione(b)).turni], ["lavorando", 1]);
    await invia(b, evento("stop", { strumenti_nel_turno: 4, resoconto_inviato: false, bloccato: true, titolo: null }));
    assert.equal((await sessione(b)).stato, "in_attesa");
    await invia(b, evento("session_end", { reason: "prompt_input_exit", titolo: null }));
    assert.equal((await sessione(b)).stato, "chiusa");
    await invia(b, evento("prompt", {}));
    assert.equal((await sessione(b)).stato, "lavorando");
  });

  test("stop vecchio arrivato dopo il prompt: salvato ma ignorato", async () => {
    await invia(b, evento("prompt", {}, { ts: tsFa(1) }));
    await invia(b, evento("stop", stop(), { ts: tsFa(10) }));
    assert.equal(await quantiEventi(), 2);
    assert.equal((await sessione(b)).stato, "lavorando");
  });

  test("lo stop conserva strumenti, resoconto, blocco e titolo", async () => {
    await invia(b, evento("stop", { strumenti_nel_turno: 5, resoconto_inviato: false, bloccato: true, titolo: "t" }));
    const salvato = await b.db.selectFrom("eventi").select(["dati", "committente_id"]).where("tipo", "=", "stop").executeTakeFirstOrThrow();
    assert.deepEqual(JSON.parse(salvato.dati), { strumenti_nel_turno: 5, resoconto_inviato: false, bloccato: true, titolo: "t" });
    assert.equal(salvato.committente_id, b.committente.id);
  });

  test("50 eventi concorrenti su sessioni diverse: tutti 200", async () => {
    const esiti = await Promise.all(Array.from({ length: 50 }, (_, i) => invia(b, evento("session_start", { source: "startup" }, { session_id: `c${i}` }))));
    assert.deepEqual(new Set(esiti.map((e) => e.status)), new Set([200]));
    assert.equal(await quantiEventi(), 50);
  });

  test("evento_id e session_id di un altro committente: 422 senza rivelare nulla", async () => {
    const priv = await b.altroCommittente(`PRIV${Date.now()}`, ["app"]);
    const ev = evento("apri_cantiere", { nome: "segreto", descrizione: null, origine: "utente" });
    await invia(b, ev);
    const rubato = await invia(b, ev, priv.token);
    assert.deepEqual(rubato, { status: 422, corpo: { errore: "evento_id già usato." } });
    const stessaSessione = await invia(b, evento("prompt", {}), priv.token);
    assert.deepEqual(stessaSessione, { status: 422, corpo: { errore: "session_id non valido." } });
    assert.equal((await sessione(b)).committente_id, b.committente.id);
  });

  describe("todo", () => {
    const todo = (completo: boolean, todos: object[], ts?: string) =>
      invia(b, evento("todo", { strumento: completo ? "TodoWrite" : "TaskUpdate", completo, todos }, ts ? { ts } : {}));
    const lista = () => b.db.selectFrom("todo").select(["chiave", "testo", "stato"]).where("session_id", "=", "s1").orderBy("ordine").execute();

    test("snapshot completo sostituisce la lista", async () => {
      await todo(true, [1, 2, 3].map((n) => ({ id: null, testo: `t${n}`, stato: "pending" })));
      await todo(true, [
        { id: null, testo: "a", stato: "completed" },
        { id: null, testo: "b", stato: "in_progress" },
      ]);
      assert.deepEqual(await lista(), [
        { chiave: "#0", testo: "a", stato: "completed" },
        { chiave: "#1", testo: "b", stato: "in_progress" },
      ]);
    });

    test("variazioni per id: inserisce, aggiorna solo quella, toglie con deleted, ordine di arrivo", async () => {
      await todo(false, [{ id: "3", testo: "primo", stato: "pending" }]);
      await todo(false, [{ id: "4", testo: "secondo", stato: "pending" }]);
      await todo(false, [{ id: "4", testo: "", stato: "completed" }]);
      assert.deepEqual(await lista(), [
        { chiave: "3", testo: "primo", stato: "pending" },
        { chiave: "4", testo: "secondo", stato: "completed" },
      ]);
      await todo(false, [{ id: "3", testo: "", stato: "deleted" }]);
      assert.deepEqual(await lista(), [{ chiave: "4", testo: "secondo", stato: "completed" }]);
    });

    test("snapshot vecchio arrivato in ritardo: ignorato", async () => {
      await todo(true, [{ id: null, testo: "nuovo", stato: "pending" }], tsFa(1));
      await todo(true, [{ id: null, testo: "vecchio", stato: "pending" }], tsFa(30));
      assert.deepEqual(await lista(), [{ chiave: "#0", testo: "nuovo", stato: "pending" }]);
      assert.equal(await quantiEventi(), 2);
    });
  });
});
