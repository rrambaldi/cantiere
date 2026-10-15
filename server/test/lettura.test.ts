import assert from "node:assert/strict";
import { test } from "node:test";
import { avvia, evento, invia, richiesta, tsFa } from "./aiuto.ts";

test("letture: cantieri aperti o tutti, sessioni con inattiva calcolata", async () => {
  const b = await avvia({ inattivita_minuti: 30 });
  try {
    await invia(b, evento("apri_cantiere", { nome: "vecchio", descrizione: null, origine: "utente" }, { session_id: "s0" }));
    await invia(b, evento("chiudi_cantiere", { esito: "abbandonato", nota: null }, { session_id: "s0" }));
    await invia(b, evento("stop", { strumenti_nel_turno: 0, resoconto_inviato: false, bloccato: false }, { session_id: "s1" }));
    await invia(b, evento("prompt", {}, { session_id: "s2", host: "fisso" }));
    await b.db.updateTable("sessioni").set({ ultimo_evento_il: tsFa(45 * 60) }).where("session_id", "=", "s1").execute();

    const aperti = (await richiesta(b, "/api/v1/cantieri?aperti=1")).corpo.cantieri;
    assert.deepEqual(aperti.map((c: { nome: string }) => c.nome), ["app@main"]);
    assert.deepEqual(aperti[0].sessioni.map((s: { session_id: string }) => s.session_id), ["s2"]);
    await invia(b, evento("apri_cantiere", { nome: "padre/figlio", descrizione: null, origine: "utente" }, { session_id: "s3" }));
    const famiglia = (await richiesta(b, "/api/v1/cantieri?aperti=1")).corpo.cantieri;
    const padre = famiglia.find((c: { nome: string }) => c.nome === "padre");
    const figlio = famiglia.find((c: { nome: string }) => c.nome === "figlio");
    assert.deepEqual([padre.padre_id, padre.percorso, figlio.padre_id, figlio.percorso], [null, "padre", padre.id, "padre/figlio"]);
    const tutti = (await richiesta(b, "/api/v1/cantieri")).corpo.cantieri;
    assert.deepEqual(tutti.map((c: { nome: string }) => c.nome).sort(), ["app@main", "figlio", "padre", "vecchio"]);

    const sessioni = (await richiesta(b, "/api/v1/sessioni")).corpo.sessioni;
    const s1 = sessioni.find((s: { session_id: string }) => s.session_id === "s1");
    assert.equal(s1.stato, "inattiva");
    const salvata = await b.db.selectFrom("sessioni").select("stato").where("session_id", "=", "s1").executeTakeFirstOrThrow();
    assert.equal(salvata.stato, "in_attesa");
    const attive = (await richiesta(b, "/api/v1/sessioni?attive=1")).corpo.sessioni;
    const idAttive = attive.map((s: { session_id: string }) => s.session_id);
    assert.ok(idAttive.includes("s2") && !idAttive.includes("s1"));
  } finally {
    await b.chiudi();
  }
});
