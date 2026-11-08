import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { TUTTI } from "../src/ambito.ts";
import { creaCollegamento } from "../src/collegamenti.ts";
import { cambiaEsito, pulizia } from "../src/dominio.ts";
import { creaIdea } from "../src/idee.ts";
import { avvia, richiesta, ui, type Banco } from "./aiuto.ts";

let b: Banco;
before(async () => (b = await avvia()));
after(() => b.chiudi());

const crea = async (corpo: object, headers: Record<string, string> = {}) => ui(b, "/ui/api/collegamenti", { method: "POST", body: JSON.stringify(corpo), headers });
const link = (azione: string, corpo: object) => richiesta(b, `/api/v1/collegamenti/${azione}`, { method: "POST", body: JSON.stringify(corpo) }, null);
const leggi = (codice: string) => link("leggi", { codice });
const usa = (codice: string, macchina = "m-1", host = "portatile") => link("usa", { codice, macchina, host });
const salute = (token: string) => richiesta(b, "/api/v1/salute", {}, token);

test("link di un progetto: si legge senza token, si usa una volta sola e dà un token che vale", async () => {
  const { status, corpo } = await crea({ progetto_id: b.progetto.id });
  assert.equal(status, 200);
  assert.match(corpo.codice, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(Date.parse(corpo.scade_il) - Date.now() > 59 * 60_000, "vale un'ora");
  const letto = await leggi(corpo.codice);
  assert.deepEqual(letto, { status: 200, corpo: { committente: "CVSTUDIO", progetto: "app", cantiere: null, progetti: ["app"] } });
  const usato = await usa(corpo.codice);
  assert.equal(usato.status, 200);
  assert.deepEqual([usato.corpo.committente, usato.corpo.progetto, usato.corpo.cantiere], ["CVSTUDIO", "app", null]);
  assert.equal((await salute(usato.corpo.token)).corpo.cliente, "CVSTUDIO");
  assert.equal((await usa(corpo.codice, "m-2")).status, 404, "una volta sola");
  assert.match((await leggi(corpo.codice)).corpo.errore, /già usato o scaduto/);
  assert.ok(!JSON.stringify(b.log).includes(corpo.codice), "il codice non va nel log");
  assert.ok(b.log.some((r) => r.tipo === "POST collegamento usa" && r.committente === "CVSTUDIO" && r.esito === 200), "lo scambio ha il committente nel log");
});

test("usato insieme da tre richieste: un solo token", async () => {
  const { codice } = (await crea({ progetto_id: b.progetto.id })).corpo;
  const esiti = await Promise.all(["m-x", "m-y", "m-z"].map((m) => usa(codice, m)));
  assert.deepEqual(esiti.map((e) => e.status).sort(), [200, 404, 404]);
});

test("link di un cantiere col suo percorso; quello del committente senza progetto, con l'elenco", async () => {
  const idea = await creaIdea(b, TUTTI, b.progetto.id, { nome: "da collegare" });
  const c = (await crea({ cantiere_id: idea.id })).corpo;
  const usato = await usa(c.codice, "m-cantiere");
  assert.deepEqual([usato.corpo.progetto, usato.corpo.cantiere], ["app", { id: idea.id, percorso: "da collegare" }]);
  const presa = await richiesta(b, `/api/v1/progetti/app/cantieri/${encodeURIComponent(`#${idea.id}`)}/prendi`, {
    method: "POST", body: JSON.stringify({ session_id: "s-link", host: "h", cwd: "/c", repo: null, branch: null }),
  }, usato.corpo.token);
  assert.equal(presa.status, 200);
  const k = (await crea({ committente_id: b.committente.id })).corpo;
  assert.deepEqual((await leggi(k.codice)).corpo, { committente: "CVSTUDIO", progetto: null, cantiere: null, progetti: ["app"] });
});

test("un token per macchina: lo scambio nuovo dalla stessa macchina sostituisce il vecchio, un'altra macchina tiene il suo", async () => {
  const token = async (macchina: string) => (await usa((await crea({ progetto_id: b.progetto.id })).corpo.codice, macchina)).corpo.token as string;
  const primo = await token("m-a");
  const altra = await token("m-b");
  const secondo = await token("m-a");
  assert.equal((await salute(primo)).status, 401);
  assert.equal((await salute(secondo)).status, 200);
  assert.equal((await salute(altra)).status, 200);
});

test("scaduto, corpo sbagliato (il link resta buono), codice inventato", async () => {
  const vecchio = await creaCollegamento(b.db, TUTTI, { progetto_id: b.progetto.id }, new Date(Date.now() - 2 * 3600_000));
  assert.equal((await leggi(vecchio.codice)).status, 404);
  const { codice } = (await crea({ progetto_id: b.progetto.id })).corpo;
  assert.equal((await link("usa", { codice, host: "h" })).status, 422);
  assert.equal((await leggi(codice)).status, 200);
  assert.equal((await leggi("inventato")).status, 404);
  assert.equal((await richiesta(b, `/api/v1/collegamenti/${codice}`, {}, null)).status, 401, "il codice nell'indirizzo non vale");
  assert.equal((await pulizia(b)).collegamenti >= 1, true, "la pulizia toglie i link scaduti");
  assert.equal((await leggi(codice)).status, 200, "e lascia quelli buoni");
});

test("rigenera: i token delle macchine e i link non usati smettono di valere", async () => {
  const altro = await b.altroCommittente(`RIG${Date.now()}`, ["uno"]);
  const k = async () => (await crea({ committente_id: altro.committente.id })).corpo.codice as string;
  const token = (await usa(await k(), "m-r")).corpo.token;
  const inAttesa = await k();
  assert.equal((await salute(token)).status, 200);
  assert.equal((await ui(b, `/ui/api/committenti/${altro.committente.id}/rigenera`, { method: "POST", body: "{}" })).status, 200);
  assert.equal((await salute(token)).status, 401);
  assert.equal((await leggi(inAttesa)).status, 404);
});

test("dashboard: nella vista di un committente niente link per gli altri; corpo sbagliato 422", async () => {
  const altro = await b.altroCommittente(`VISTA${Date.now()}`, ["suo"]);
  const vista = { "x-forgia-committente": altro.committente.nome };
  assert.equal((await crea({ progetto_id: b.progetto.id }, vista)).status, 404);
  assert.equal((await crea({ committente_id: b.committente.id }, vista)).status, 404);
  assert.equal((await crea({ committente_id: altro.committente.id }, vista)).status, 200);
  const idea = await creaIdea(b, TUTTI, b.progetto.id, { nome: "non sua" });
  assert.equal((await crea({ cantiere_id: idea.id }, vista)).status, 404);
  await cambiaEsito(b, TUTTI, idea.id, "abbandona");
  const chiuso = await crea({ cantiere_id: idea.id });
  assert.deepEqual([chiuso.status, chiuso.corpo.errore], [409, "Il cantiere è abbandonato: il link si prende per un'idea o un cantiere aperto."]);
  assert.equal((await crea({ progetto_id: b.progetto.id, cantiere_id: 1 })).status, 422);
  assert.equal((await crea({})).status, 422);
});
