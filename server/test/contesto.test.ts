import assert from "node:assert/strict";
import { test } from "node:test";
import { avvia, evento, invia } from "./aiuto.ts";

const REGOLE = `Regole:
- Cantiere provvisorio e lavoro chiaramente diverso? Chiama apri_cantiere (server MCP forgia, origine "claude") con un nome breve e specifico.
- Se l'utente cambia argomento in modo netto, fai lo stesso.`;
const RESOCONTO =
  "- Prima di chiudere un turno in cui hai lavorato, chiama aggiorna_stato: fatto, prossimo, bloccato_da. Frasi brevi; mai segreti, dati personali o dati dei clienti.";

test("contesto di avvio: provvisorio, confermato, modalità off", async () => {
  const b = await avvia();
  const off = await avvia({ modalita_resoconto: "off" });
  try {
    const avvio = await invia(b, evento("session_start", { source: "startup" }, { session_id: "abc" }));
    assert.equal(avvio.corpo.contesto, `[forgia] session_id=abc\nCantiere: app@main (auto, provvisorio)\n${REGOLE}\n${RESOCONTO}`);

    await invia(b, evento("apri_cantiere", { nome: "oauth-logiquo", descrizione: null, origine: "utente" }, { session_id: "abc" }));
    const ripresa = await invia(b, evento("session_start", { source: "compact" }, { session_id: "abc" }));
    assert.equal(ripresa.corpo.contesto.split("\n")[1], "Cantiere: oauth-logiquo (utente, confermato)");

    const senza = await invia(off, evento("session_start", { source: "startup" }, { session_id: "abc" }));
    assert.equal(senza.corpo.contesto, `[forgia] session_id=abc\nCantiere: app@main (auto, provvisorio)\n${REGOLE}`);
  } finally {
    await b.chiudi();
    await off.chiudi();
  }
});

test("hint del provvisorio nei primi hint_max prompt, reinvii esclusi; poi null", async () => {
  const b = await avvia({ hint_max: 3 });
  try {
    const primo = evento("prompt", {});
    const contesti = [];
    for (const ev of [primo, primo, evento("prompt", {}), evento("prompt", {}), evento("prompt", {})]) {
      contesti.push((await invia(b, ev)).corpo.contesto);
    }
    const hint = "[forgia] Cantiere provvisorio: app@main. Se non corrisponde al lavoro, apri_cantiere.";
    assert.deepEqual(contesti, [hint, hint, hint, hint, null]);
  } finally {
    await b.chiudi();
  }
});

test("conferme dei comandi, niente contesto per prompt confermati, todo, stop, session_end", async () => {
  const b = await avvia();
  try {
    const apertura = await invia(b, evento("apri_cantiere", { nome: "oauth-logiquo", descrizione: null, origine: "utente" }));
    assert.equal(
      apertura.corpo.contesto,
      `[forgia] Comando /cantiere gestito: cantiere "oauth-logiquo" aperto (id ${apertura.corpo.cantiere.id}). Rispondi all'utente con una sola riga di conferma.`,
    );
    const altri = [
      evento("prompt", {}),
      evento("todo", { strumento: "TodoWrite", completo: true, todos: [] }),
      evento("stop", { strumenti_nel_turno: 1, resoconto_inviato: false, bloccato: false }),
      evento("session_end", { reason: "other" }),
    ];
    for (const ev of altri) assert.equal((await invia(b, ev)).corpo.contesto, null, ev.tipo);
    const chiusura = await invia(b, evento("chiudi_cantiere", { esito: "sospeso", nota: null }));
    assert.ok(chiusura.corpo.contesto.startsWith('[forgia] Comando /cantiere gestito: cantiere "oauth-logiquo" chiuso (esito sospeso)'));
  } finally {
    await b.chiudi();
  }
});

test("cantieri figli: percorso nel contesto di avvio e conferma della chiusura forzata", async () => {
  const b = await avvia();
  try {
    await invia(b, evento("apri_cantiere", { nome: "logiquo-v2/oauth", descrizione: null, origine: "utente" }, { session_id: "f1" }));
    const avvio = await invia(b, evento("session_start", { source: "resume" }, { session_id: "f1" }));
    assert.equal(avvio.corpo.contesto.split("\n")[1], "Cantiere: logiquo-v2/oauth (utente, confermato)");

    await invia(b, evento("apri_cantiere", { nome: "logiquo-v2", descrizione: null, origine: "utente" }, { session_id: "p1" }));
    const chiusura = await invia(b, evento("chiudi_cantiere", { esito: "completato", nota: null, forza: true }, { session_id: "p1" }));
    assert.ok(
      chiusura.corpo.contesto.startsWith('[forgia] Comando /cantiere gestito: cantiere "logiquo-v2" chiuso (esito completato), con i figli oauth'),
      chiusura.corpo.contesto,
    );
  } finally {
    await b.chiudi();
  }
});
