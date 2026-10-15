import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { avvia, evento, invia, richiesta, tsFa, type Banco } from "./aiuto.ts";

describe("eventi", () => {
  let b: Banco;
  before(async () => (b = await avvia()));
  after(() => b.chiudi());
  beforeEach(async () => {
    for (const t of ["eventi", "sessioni", "cantieri", "todo"] as const) await b.db.deleteFrom(t).execute();
  });
  const sessione = (id = "s1") => b.db.selectFrom("sessioni").selectAll().where("session_id", "=", id).executeTakeFirstOrThrow();
  const quantiEventi = async () => (await b.db.selectFrom("eventi").select("id").execute()).length;

  test("validazione: 422 e niente salvato", async () => {
    const casi = [
      evento("compila", {}),
      evento("chiudi_cantiere", { esito: "finito", nota: null }),
      { ...evento("prompt", {}), extra: 1 },
      evento("prompt", { testo: "il prompt non va mai inviato" }),
      evento("apri_cantiere", { nome: "x".repeat(81), descrizione: null, origine: "utente" }),
      evento("todo", { strumento: "TodoWrite", completo: true, todos: [{ id: null, testo: "x".repeat(501), stato: "pending" }] }),
      evento("prompt", {}, { ts: "ieri" }),
    ];
    for (const ev of casi) assert.equal((await invia(b, ev)).status, 422, JSON.stringify(ev).slice(0, 80));
    const nonJson = await richiesta(b, "/api/v1/eventi", { method: "POST", body: "{non json" });
    assert.equal(nonJson.status, 422);
    assert.equal(await quantiEventi(), 0);
  });

  test("forma della risposta", async () => {
    const r = await invia(b, evento("session_start", { source: "startup" }));
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.corpo).sort(), ["cantiere", "config", "contesto"]);
    assert.deepEqual(r.corpo.config, { modalita_resoconto: "forzato", soglia_strumenti: 3 });
    assert.deepEqual(Object.keys(r.corpo.cantiere).sort(), ["confermato", "id", "nome", "origine", "percorso"]);
  });

  test("idempotenza: stesso evento_id, un evento, stessa risposta, un turno", async () => {
    const ev = evento("prompt", {});
    const prima = await invia(b, ev);
    const seconda = await invia(b, ev);
    assert.deepEqual(seconda, prima);
    assert.equal(await quantiEventi(), 1);
    assert.equal((await sessione()).turni, 1);
  });

  test("sessione sconosciuta creata al volo da un evento qualsiasi", async () => {
    const r = await invia(b, evento("stop", { strumenti_nel_turno: 0, resoconto_inviato: false, bloccato: false }, { session_id: "nuova" }));
    assert.equal(r.status, 200);
    assert.equal((await sessione("nuova")).stato, "in_attesa");
    assert.equal(r.corpo.cantiere.nome, "app@main");
  });

  test("ciclo session_start → prompt → stop → session_end → prompt", async () => {
    await invia(b, evento("session_start", { source: "startup" }));
    assert.equal((await sessione()).stato, "attiva");
    await invia(b, evento("prompt", {}));
    assert.deepEqual([(await sessione()).stato, (await sessione()).turni], ["lavorando", 1]);
    await invia(b, evento("stop", { strumenti_nel_turno: 4, resoconto_inviato: false, bloccato: true }));
    assert.equal((await sessione()).stato, "in_attesa");
    await invia(b, evento("session_end", { reason: "prompt_input_exit" }));
    assert.equal((await sessione()).stato, "chiusa");
    await invia(b, evento("prompt", {}));
    assert.equal((await sessione()).stato, "lavorando");
  });

  test("stop vecchio arrivato dopo il prompt: salvato ma ignorato", async () => {
    await invia(b, evento("prompt", {}, { ts: tsFa(1) }));
    await invia(b, evento("stop", { strumenti_nel_turno: 2, resoconto_inviato: true, bloccato: false }, { ts: tsFa(10) }));
    assert.equal(await quantiEventi(), 2);
    assert.equal((await sessione()).stato, "lavorando");
  });

  test("lo stop conserva strumenti, resoconto e blocco", async () => {
    await invia(b, evento("stop", { strumenti_nel_turno: 5, resoconto_inviato: false, bloccato: true }));
    const salvato = await b.db.selectFrom("eventi").select(["dati", "cliente_id"]).where("tipo", "=", "stop").executeTakeFirstOrThrow();
    assert.deepEqual(JSON.parse(salvato.dati), { strumenti_nel_turno: 5, resoconto_inviato: false, bloccato: true });
  });

  test("50 eventi concorrenti su sessioni diverse: tutti 200", async () => {
    const esiti = await Promise.all(
      Array.from({ length: 50 }, (_, i) => invia(b, evento("session_start", { source: "startup" }, { session_id: `c${i}` }))),
    );
    assert.deepEqual(new Set(esiti.map((e) => e.status)), new Set([200]));
    assert.equal(await quantiEventi(), 50);
  });

  describe("todo", () => {
    const todo = (completo: boolean, todos: object[], ts?: string) =>
      invia(b, evento("todo", { strumento: completo ? "TodoWrite" : "TaskUpdate", completo, todos }, ts ? { ts } : {}));
    const lista = () =>
      b.db.selectFrom("todo").select(["chiave", "testo", "stato"]).where("session_id", "=", "s1").orderBy("ordine").execute();

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
