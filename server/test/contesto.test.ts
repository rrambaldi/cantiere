import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { TUTTI } from "../src/ambito.ts";
import { cambiaEsito, creaProgetto } from "../src/dominio.ts";
import { creaIdea } from "../src/idee.ts";
import { apri, avvia, cantiere, changeAttivo, copia, evento, invia, type Banco } from "./aiuto.ts";

const DOMANDA =
  '- Al primo messaggio dell\'utente, prima di rispondere, chiedi con una domanda a scelta dove va questa sessione: un cantiere aperto, un\'idea (si prende con /cantiere prendi <percorso>), un cantiere nuovo (apri_cantiere con origine "utente"), oppure lavoro diretto sul progetto.';
const RESOCONTO =
  "- Prima di chiudere un turno in cui hai lavorato, chiama aggiorna_stato: fatto, prossimo, bloccato_da. Frasi brevi; mai segreti, dati personali o dati dei clienti.";
const RAMO =
  '- Se l\'utente fa partire da un task di questo cantiere un\'attività a sé: se la sessione passa a lavorarci, apri_cantiere con origine "utente" e task (il numero in tasks.md) registra il legame da solo; per farne partire una o più senza lasciare questo cantiere, proponi /cantiere dirama <progetto>/<nome> --task <numero>.';

describe("contesto", () => {
  let b: Banco;
  let poker: number;
  before(async () => {
    b = await avvia();
    poker = (await creaProgetto(b.db, b.committente.id, "poker")).id;
  });
  after(() => b.chiudi());
  beforeEach(async () => {
    for (const t of ["eventi", "sessioni", "cantieri", "esiti", "change_copie", "change_file"] as const) await b.db.deleteFrom(t).execute();
    await b.db.updateTable("progetti").set({ openspec_il: null }).execute();
  });
  const inPoker = { progetto: "poker" };
  const avvio = (session_id: string, source = "startup") => invia(b, evento("session_start", { source }, { session_id, ...inPoker }));

  test("sessione nuova in un progetto: lavoro diretto, cantieri aperti, idee e domanda iniziale", async () => {
    await apri(b, "altra", "pdfconverter", "utente", inPoker);
    await creaIdea(b, TUTTI, poker, { nome: "idoc-converter" });
    const r = await avvio("abc");
    assert.equal(
      r.corpo.contesto,
      [
        "[forgia] session_id=abc",
        "Progetto: CVSTUDIO/poker",
        "Cantiere: nessuno, lavoro diretto sul progetto",
        "Cantieri aperti: pdfconverter",
        "Idee: idoc-converter",
        "Regole:",
        DOMANDA,
        RESOCONTO,
      ].join("\n"),
    );
  });

  test("ripresa di una sessione in un cantiere: niente domanda iniziale", async () => {
    await apri(b, "abc", "idoc-converter/prototipo", "utente", inPoker);
    const righe = (await avvio("abc", "resume")).corpo.contesto.split("\n");
    assert.equal(righe[2], "Cantiere: idoc-converter/prototipo (utente)");
    assert.deepEqual(righe[3].replace("Cantieri aperti: ", "").split(", ").sort(), ["idoc-converter", "idoc-converter/prototipo"]);
    assert.equal(righe[4], "Idee: nessuna");
    assert.deepEqual(righe.slice(5), ["Regole:", RAMO, RESOCONTO]);
  });

  test("abbandonato da archiviare: riga e regola con il comando", async () => {
    const { id } = (await apri(b, "x", "vecchio-parser", "utente", inPoker)).corpo.cantiere;
    await cambiaEsito(b, TUTTI, id, "abbandona");
    await copia(b, { attivi: [changeAttivo("vecchio-parser")], archiviati: [] }, "poker");
    const contesto = (await avvio("abc")).corpo.contesto;
    assert.ok(contesto.includes("\nDa archiviare: vecchio-parser\nRegole:\n"), contesto);
    assert.ok(contesto.includes("\n- Proponi all'utente di archiviare vecchio-parser con: openspec archive vecchio-parser --skip-specs --yes\n"));
  });

  test("elenchi corti: i 10 più recenti seguiti da e altri n", async () => {
    for (let i = 1; i <= 13; i++) {
      await apri(b, `s${i}`, `c${i}`, "utente", inPoker);
      await b.db.updateTable("cantieri").set({ aggiornato_il: `2026-10-${String(i + 10).padStart(2, "0")}T00:00:00.000Z` }).where("id", "=", (await cantiere(b, `c${i}`, poker)).id).execute();
    }
    const riga = (await avvio("abc")).corpo.contesto.split("\n")[3];
    assert.equal(riga, "Cantieri aperti: c13, c12, c11, c10, c9, c8, c7, c6, c5, c4 e altri 3");
  });

  test("avviso al primo prompt dopo una sospensione; altrimenti null", async () => {
    const { id } = (await apri(b, "s1", "export-pdf", "utente", inPoker)).corpo.cantiere;
    assert.equal((await invia(b, evento("prompt", {}, inPoker))).corpo.contesto, null);
    await cambiaEsito(b, TUTTI, id, "sospendi");
    assert.equal(
      (await invia(b, evento("prompt", {}, inPoker))).corpo.contesto,
      "[forgia] Il cantiere export-pdf è sospeso: ora lavori direttamente su poker. Dillo all'utente in una riga.",
    );
  });

  test("conferma dell'apertura da comando; niente contesto per todo, stop, session_end", async () => {
    const r = await apri(b, "s1", "idoc-converter/preprod", "utente", inPoker);
    assert.equal(
      r.corpo.contesto,
      '[forgia] Comando /cantiere gestito: cantiere "idoc-converter/preprod" aperto (change idoc-converter-preprod). Rispondi all\'utente con una sola riga di conferma.',
    );
    const altri = [
      evento("todo", { strumento: "TodoWrite", completo: true, todos: [] }, inPoker),
      evento("stop", { strumenti_nel_turno: 1, resoconto_inviato: false, bloccato: false, titolo: null }, inPoker),
      evento("session_end", { reason: "other", titolo: null }, inPoker),
    ];
    for (const ev of altri) assert.equal((await invia(b, ev)).corpo.contesto, null, ev.tipo);
  });

  test("modalità off: in un cantiere non resta nessuna regola", async () => {
    const off = await avvia({ modalita_resoconto: "off" });
    try {
      await apri(off, "abc", "pdfconverter");
      const contesto = (await invia(off, evento("session_start", { source: "compact" }, { session_id: "abc" }))).corpo.contesto;
      assert.ok(!contesto.includes("Regole:") && !contesto.includes("aggiorna_stato"), contesto);
      const diretto = (await invia(off, evento("session_start", { source: "startup" }, { session_id: "nuova" }))).corpo.contesto;
      assert.ok(diretto.endsWith(`Regole:\n${DOMANDA}`), diretto);
    } finally {
      await off.chiudi();
    }
  });
});
