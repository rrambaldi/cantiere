import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { pulizia } from "../src/dominio.ts";
import { apri, avvia, cantiere, changeAttivo, copia, evento, invia, richiesta, stop, tsFa, ui, type Banco } from "./aiuto.ts";

const TASKS = "## 1. Prove\n\n- [ ] 1.1 Scrivere la rotta\n- [ ] 1.2 Verificare nel browser che il bottone si veda\n- [x] 1.3 Prova di insieme\n";

describe("comandi dalla dashboard", () => {
  let b: Banco;
  before(async () => {
    b = await avvia();
    await b.altroCommittente("PRIV", []);
  });
  after(() => b.chiudi());
  beforeEach(async () => {
    for (const t of ["eventi", "sessioni", "cantieri", "domande", "comandi", "change_copie", "change_file"] as const) await b.db.deleteFrom(t).execute();
  });

  const post = (percorso: string, corpo: object, headers: Record<string, string> = {}) => ui(b, percorso, { method: "POST", body: JSON.stringify(corpo), headers });
  const scrivi = (testo: string, session_id = "s1", headers: Record<string, string> = {}) => post("/ui/api/comandi", { session_id, testo }, headers);
  /** Un evento della sessione che accetta comandi, o no; restituisce i comandi della risposta. */
  const passo = async (session_id = "s1", comandi = true, extra: object = {}) =>
    (await invia(b, evento("prompt", {}, { session_id, ...(comandi ? { comandi: true } : {}), ...extra }))).corpo.comandi as { id: number; testo: string }[];
  const stati = async () => (await b.db.selectFrom("comandi").select("stato").orderBy("id").execute()).map((r) => r.stato);

  test("validazione dell'evento: comandi non boolean dà 422", async () => {
    assert.equal((await invia(b, evento("prompt", {}, { comandi: "si" }))).status, 422);
    assert.equal((await invia(b, evento("prompt", {}, { comandi: true }))).status, 200);
  });

  test("consegna una sola volta, dal più vecchio, e la scheda lo mostra consegnato con l'ora", async () => {
    await passo("s1", false);
    assert.equal((await scrivi("  continua con i test  ")).status, 200);
    await scrivi("poi fai il commit");
    assert.deepEqual((await passo()).map((c) => c.testo), ["continua con i test", "poi fai il commit"]);
    assert.deepEqual(await passo(), []);
    const progetto = (await ui(b, "/ui/api/albero")).corpo.committenti[0].progetti[0];
    const [, primo] = (await ui(b, `/ui/api/progetti/${progetto.id}/non-censite`)).corpo.sessioni[0].comandi;
    assert.equal(primo.stato, "consegnato");
    assert.ok(primo.consegnato_il);
  });

  test("plugin senza abilitazione: comandi vuoti e il comando resta in attesa", async () => {
    await passo("s1", false);
    await scrivi("esegui i test");
    assert.deepEqual(await passo("s1", false), []);
    assert.deepEqual(await stati(), ["in_attesa"]);
  });

  test("evento ripetuto: stessa risposta, comandi compresi, senza consegnare altro", async () => {
    await passo("s1", false);
    await scrivi("primo");
    const ev = evento("prompt", {}, { comandi: true });
    const prima = (await invia(b, ev)).corpo;
    await scrivi("secondo");
    assert.deepEqual((await invia(b, ev)).corpo, prima);
    assert.deepEqual(prima.comandi.map((c: any) => c.testo), ["primo"]);
    assert.deepEqual(await stati(), ["consegnato", "in_attesa"]);
  });

  test("scadenza: dopo 24 ore non si consegna e risulta scaduto; la pulizia toglie i vecchi", async () => {
    await passo("s1", false);
    await scrivi("vecchio");
    await b.db.updateTable("comandi").set({ creato_il: tsFa(25 * 3600) }).execute();
    const progetto = (await ui(b, "/ui/api/albero")).corpo.committenti[0].progetti[0];
    assert.equal((await ui(b, `/ui/api/progetti/${progetto.id}/non-censite`)).corpo.sessioni[0].comandi[0].stato, "scaduto");
    assert.deepEqual(await passo(), []);
    assert.deepEqual(await stati(), ["scaduto"]);
    await b.db.updateTable("comandi").set({ creato_il: tsFa(200 * 86400) }).execute();
    assert.equal((await pulizia(b)).comandi, 1);
  });

  test("creazione: 422 testo vuoto o lungo, 404 sessione ignota o di un altro committente, 409 chiusa e sesto in attesa", async () => {
    await passo("s1", false);
    assert.equal((await scrivi("   ")).status, 422);
    assert.equal((await scrivi("x".repeat(501))).status, 422);
    assert.equal((await scrivi("ok", "ignota")).status, 404);
    assert.equal((await scrivi("ok", "s1", { "x-forgia-committente": "PRIV" })).status, 404);
    for (let i = 0; i < 5; i++) assert.equal((await scrivi(`c${i}`)).status, 200);
    assert.equal((await scrivi("sesto")).status, 409);
    await invia(b, evento("session_end", { reason: "other", titolo: null }, { session_id: "s2" }));
    assert.equal((await scrivi("ok", "s2")).status, 409);
    assert.equal((await b.db.selectFrom("comandi").select("id").execute()).length, 5);
  });

  test("il Bearer non crea comandi: nessuna rotta nell'API, e la dashboard vuole il certificato", async () => {
    await passo("s1", false);
    const corpo = JSON.stringify({ session_id: "s1", testo: "rm -rf" });
    assert.equal((await richiesta(b, "/api/v1/comandi", { method: "POST", body: corpo })).status, 404);
    const senza = await ui(b, "/ui/api/comandi", { method: "POST", body: corpo, certificato: false, headers: { authorization: `Bearer ${b.token}` } });
    assert.equal(senza.status, 403);
    assert.deepEqual(await stati(), []);
  });

  test("annullo: prima della consegna non arriva; dopo la consegna 409", async () => {
    await passo("s1", false);
    const { comando } = (await scrivi("annullami")).corpo;
    assert.equal((await post(`/ui/api/comandi/${comando.id}/annulla`, {})).corpo.comando.stato, "annullato");
    assert.deepEqual(await passo(), []);
    const altro = (await scrivi("consegnami")).corpo.comando;
    await passo();
    assert.equal((await post(`/ui/api/comandi/${altro.id}/annulla`, {})).status, 409);
    assert.equal((await post("/ui/api/comandi/999999/annulla", {})).status, 404);
    const terzo = (await scrivi("di un altro committente")).corpo.comando;
    assert.equal((await post(`/ui/api/comandi/${terzo.id}/annulla`, {}, { "x-forgia-committente": "PRIV" })).status, 404);
  });

  test("la scheda del cantiere mostra anche i comandi di una sessione ferma", async () => {
    await apri(b, "s1", "nis2");
    await scrivi("per quando torni");
    await b.db.updateTable("sessioni").set({ ultimo_evento_il: tsFa(3 * 3600) }).execute();
    const d = (await ui(b, `/ui/api/cantieri/${(await cantiere(b, "nis2")).id}`)).corpo;
    assert.deepEqual([d.cantiere.sessioni, d.comandi.map((c: any) => c.testo)], [[], ["per quando torni"]]);
  });

  test("una sessione chiusa non riceve comandi, anche da un evento arrivato tardi", async () => {
    await passo("s1", false);
    await scrivi("troppo tardi");
    await invia(b, evento("session_end", { reason: "other", titolo: null }));
    assert.deepEqual(await passo("s1", true, { ts: tsFa(60) }), []);
    assert.deepEqual(await stati(), ["in_attesa"]);
  });

  test("il testo dei comandi non finisce nei log né nelle letture dell'API", async () => {
    await apri(b, "s1", "nis2");
    await scrivi("TESTO-SEGRETO-DEL-COMANDO");
    for (const p of ["/api/v1/sessioni", "/api/v1/cantieri"]) assert.ok(!JSON.stringify((await richiesta(b, p)).corpo).includes("SEGRETO"), p);
    await passo();
    assert.ok(!JSON.stringify(b.log).includes("SEGRETO"));
  });

  describe("esiti", () => {
    const domanda = (id: string, session_id = "s1") => invia(b, evento("domanda", { id, tipo: "scelta", testo: "Il bottone si vede?", opzioni: [] }, { session_id }));
    const esitoDomanda = (corpo: object, headers?: Record<string, string>) => post("/ui/api/domande/esito", { session_id: "s1", domanda_id: "d1", ...corpo }, headers);
    const conTasks = async () => {
      await copia(b, { attivi: [changeAttivo("nis2", { "tasks.md": TASKS })], archiviati: [] });
      return (await cantiere(b, "nis2")).id;
    };

    test("conferma di una domanda: passa a risposta, il pallino sparisce, l'esito aspetta la consegna", async () => {
      await apri(b, "s1", "nis2");
      await domanda("d1");
      assert.equal((await esitoDomanda({ esito: "confermato" })).status, 200);
      const [domandaChiusa] = await b.db.selectFrom("domande").select("stato").execute();
      assert.equal(domandaChiusa.stato, "risposta");
      const nis2 = (await richiesta(b, "/api/v1/cantieri")).corpo.cantieri[0];
      assert.equal(nis2.domande_in_attesa, 0);
      assert.deepEqual(await stati(), ["in_attesa"]);
    });

    test("rifiuto senza testo 422, domanda chiusa 409, di un altro committente 404", async () => {
        await domanda("d1");
      assert.equal((await esitoDomanda({ esito: "negato", feedback: "  " })).status, 422);
      assert.equal((await esitoDomanda({ esito: "boh" })).status, 422);
      assert.equal((await esitoDomanda({ esito: "confermato" }, { "x-forgia-committente": "PRIV" })).status, 404);
      await invia(b, evento("risposta", { id: "d1" }));
      assert.equal((await esitoDomanda({ esito: "confermato" })).status, 409);
      assert.deepEqual(await stati(), []);
    });

    test("rifiuto con feedback: alla sessione arriva l'esito negato con la domanda e il feedback", async () => {
      await domanda("d1");
      await esitoDomanda({ esito: "negato", feedback: "il pulsante non si vede al telefono" });
      const [c] = await passo();
      assert.match(c.testo, /"Il bottone si vede\?" \(sessione s1 su portatile\).*non va.*il pulsante non si vede al telefono/);
    });

    test("una risposta libera dalla dashboard non esiste", async () => {
      await domanda("d1");
      assert.equal((await post("/ui/api/domande/1/risposta", { testo: "sì" })).status, 404);
    });

    test("verifica confermata senza sessioni aperte: la scheda la mostra e l'esito resta in attesa", async () => {
      await apri(b, "s1", "nis2");
      const id = await conTasks();
      await invia(b, evento("session_end", { reason: "other", titolo: null }));
      const task = "1.2 Verificare nel browser che il bottone si veda";
      assert.equal((await post(`/ui/api/cantieri/${id}/verifica`, { task, esito: "confermato" })).status, 200);
      const d = (await ui(b, `/ui/api/cantieri/${id}`)).corpo;
      assert.deepEqual(d.verifiche, [task]);
      assert.deepEqual(d.comandi.map((c: any) => [c.task, c.esito, c.stato]), [[task, "confermato", "in_attesa"]]);
    });

    test("verifica: 409 su un task che non è di verifica o è già fatto, 404 fuori ambito; un nuovo esito prende il posto del vecchio", async () => {
        await apri(b, "s1", "nis2");
      const id = await conTasks();
      const verifica = (task: string, corpo: object = { esito: "confermato" }, headers?: Record<string, string>) => post(`/ui/api/cantieri/${id}/verifica`, { task, ...corpo }, headers);
      assert.equal((await verifica("1.1 Scrivere la rotta")).status, 409);
      assert.equal((await verifica("1.3 Prova di insieme")).status, 409);
      assert.equal((await verifica("1.2 Verificare nel browser che il bottone si veda", undefined, { "x-forgia-committente": "PRIV" })).status, 404);
      await verifica("1.2 Verificare nel browser che il bottone si veda");
      await verifica("1.2 Verificare nel browser che il bottone si veda", { esito: "negato", feedback: "al telefono no" });
      assert.deepEqual(await stati(), ["annullato", "in_attesa"]);
    });

    test("consegna alla prossima sessione del cantiere, e a nessuno di nuovo", async () => {
      await apri(b, "s1", "nis2");
      const id = await conTasks();
      await domanda("d1");
      await esitoDomanda({ esito: "confermato" });
      await post(`/ui/api/cantieri/${id}/verifica`, { task: "1.2 Verificare nel browser che il bottone si veda", esito: "confermato" });
      await invia(b, evento("stop", stop()));
      await apri(b, "s2", "nis2");
      assert.deepEqual(await passo("altrove"), []); // un'altra sessione del progetto, fuori dal cantiere
      const arrivati = await passo("s2");
      assert.equal(arrivati.length, 2);
      assert.match(arrivati[0].testo, /Il bottone si vede\?.*confermo/);
      assert.match(arrivati[1].testo, /1\.2 Verificare nel browser.*smarca il task/);
      assert.deepEqual([await passo("s1"), await passo("s2")], [[], []]);
    });

    test("l'esito di un cantiere non scade a 24 ore, quello senza cantiere sì", async () => {
      await apri(b, "s1", "nis2");
      const id = await conTasks();
      await post(`/ui/api/cantieri/${id}/verifica`, { task: "1.2 Verificare nel browser che il bottone si veda", esito: "confermato" });
      await domanda("d1");
      await esitoDomanda({ esito: "confermato" });
      await domanda("d2", "s9");
      await post("/ui/api/domande/esito", { session_id: "s9", domanda_id: "d2", esito: "confermato" });
      await b.db.updateTable("comandi").set({ creato_il: tsFa(25 * 3600) }).execute();
      assert.deepEqual(await passo("s9"), []);
      assert.equal((await passo("s1")).length, 2);
      assert.deepEqual(await stati(), ["consegnato", "consegnato", "scaduto"]);
    });

    test("senza cantiere l'esito di una domanda va solo alla sessione che l'ha fatta", async () => {
      await domanda("d1");
      await esitoDomanda({ esito: "confermato" });
      assert.deepEqual(await passo("s2"), []);
      assert.equal((await passo("s1")).length, 1);
    });
  });
});
