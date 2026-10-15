import assert from "node:assert/strict";
import { test } from "node:test";
import { TUTTI } from "../src/ambito.ts";
import { cambiaEsito, creaProgetto } from "../src/dominio.ts";
import { creaIdea } from "../src/idee.ts";
import { apri, avvia, changeAttivo, copia, evento, invia, richiesta, stop, tsFa } from "./aiuto.ts";

test("letture ristrette al committente, filtri, campi del Contratto v2 e inattiva calcolata", async () => {
  const b = await avvia({ inattivita_minuti: 30 });
  try {
    const mercurius = await creaProgetto(b.db, b.committente.id, "mercurius");
    const priv = await b.altroCommittente("PRIV", ["app"]);
    const vecchio = (await apri(b, "s0", "vecchio")).corpo.cantiere;
    await cambiaEsito(b, TUTTI, vecchio.id, "abbandona");
    await apri(b, "s1", "padre/figlio");
    await invia(b, evento("stop", stop("fix login mobile"), { session_id: "s1" }));
    await invia(b, evento("prompt", {}, { session_id: "s2", host: "fisso" }));
    await creaIdea(b, TUTTI, mercurius.id, { nome: "tassi BCE" });
    await copia(b, { attivi: [changeAttivo("padre-figlio", { "tasks.md": "- [x] a\n- [ ] b" })], archiviati: [] });
    await invia(b, evento("prompt", {}, { session_id: "p1" }), priv.token);
    await invia(b, evento("apri_cantiere", { nome: "segreto", descrizione: null, origine: "utente" }, { session_id: "p1" }), priv.token);
    await b.db.updateTable("sessioni").set({ ultimo_evento_il: tsFa(45 * 60) }).where("session_id", "=", "s2").execute();

    const tutti = (await richiesta(b, "/api/v1/cantieri")).corpo.cantieri;
    assert.deepEqual(tutti.map((c: any) => c.percorso).sort(), ["padre", "padre/figlio", "tassi BCE", "vecchio"]);
    const figlio = tutti.find((c: any) => c.percorso === "padre/figlio");
    for (const campo of ["id", "progetto", "nome", "percorso", "padre_id", "stato", "origine", "change", "descrizione", "creato_il", "aggiornato_il", "artefatti", "task", "fasi", "change_mancante", "da_archiviare", "file_idea", "sessioni"]) {
      assert.ok(campo in figlio, campo);
    }
    assert.deepEqual([figlio.change, figlio.task, figlio.progetto], ["padre-figlio", { fatti: 1, totali: 2 }, "app"]);
    assert.deepEqual(figlio.sessioni.map((s: any) => [s.session_id, s.titolo]), [["s1", "fix login mobile"]]);
    assert.equal(tutti.find((c: any) => c.percorso === "tassi BCE").stato, "idea");

    const aperti = (await richiesta(b, "/api/v1/cantieri?aperti=1")).corpo.cantieri.map((c: any) => c.percorso).sort();
    assert.deepEqual(aperti, ["padre", "padre/figlio"]);
    const diMercurius = (await richiesta(b, "/api/v1/cantieri?progetto=mercurius")).corpo.cantieri.map((c: any) => c.percorso);
    assert.deepEqual(diMercurius, ["tassi BCE"]);

    const sessioni = (await richiesta(b, "/api/v1/sessioni")).corpo.sessioni;
    assert.deepEqual(sessioni.map((s: any) => s.session_id).sort(), ["s0", "s1", "s2"]);
    const s2 = sessioni.find((s: any) => s.session_id === "s2");
    assert.deepEqual([s2.stato, s2.cantiere, s2.progetto], ["inattiva", null, "app"]);
    const s1 = sessioni.find((s: any) => s.session_id === "s1");
    assert.deepEqual([s1.cantiere, s1.titolo], ["padre/figlio", "fix login mobile"]);
    assert.ok(!("cantiere_id" in s1) && !("progetto_id" in s1));
    assert.equal((await b.db.selectFrom("sessioni").select("stato").where("session_id", "=", "s2").executeTakeFirstOrThrow()).stato, "lavorando");
    const attive = (await richiesta(b, "/api/v1/sessioni?attive=1")).corpo.sessioni.map((s: any) => s.session_id);
    assert.ok(attive.includes("s1") && !attive.includes("s2"));
    assert.deepEqual((await richiesta(b, "/api/v1/sessioni?progetto=mercurius")).corpo.sessioni, []);

    const delPriv = (await richiesta(b, "/api/v1/cantieri", {}, priv.token)).corpo.cantieri.map((c: any) => c.percorso);
    assert.deepEqual(delPriv, ["segreto"]);
    assert.deepEqual((await richiesta(b, "/api/v1/sessioni", {}, priv.token)).corpo.sessioni.map((s: any) => s.session_id), ["p1"]);
  } finally {
    await b.chiudi();
  }
});
