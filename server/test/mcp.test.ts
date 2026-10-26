import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, describe, test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { TUTTI } from "../src/ambito.ts";
import { creaProgetto } from "../src/dominio.ts";
import { creaIdea } from "../src/idee.ts";
import { apri, avvia, changeAttivo, copia, evento, invia, type Banco } from "./aiuto.ts";

type Risultato = { content: { type: string; text: string }[]; structuredContent?: Record<string, any>; isError?: boolean };

async function connetti(b: Banco, token: string, versionNegotiation?: object) {
  const client = new Client({ name: "test", version: "1" }, versionNegotiation ? { versionNegotiation } : undefined);
  await client.connect(new StreamableHTTPClientTransport(new URL(`${b.url}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return client;
}

for (const [era, versionNegotiation] of [
  ["2025 (handshake)", undefined],
  ["2026-07-28", { mode: { pin: "2026-07-28" } }],
] as const) {
  describe(`tool MCP, protocollo ${era}`, () => {
    let b: Banco;
    let client: Client;
    before(async () => {
      b = await avvia();
      await creaProgetto(b.db, b.committente.id, "mercurius");
      client = await connetti(b, b.token, versionNegotiation);
    });
    after(async () => {
      await client.close();
      await b.chiudi();
    });
    const chiama = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as Risultato;

    test("elenco dei quattro tool, senza chiudi_cantiere", async () => {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), ["aggiorna_stato", "apri_cantiere", "elenca_cantieri", "stato_sessione"]);
    });

    test("claude.ai senza progetto: rifiuto che chiede il progetto, niente salvato", async () => {
      const r = await chiama("aggiorna_stato", { session_id: "web-0", fatto: "letto", prossimo: "scrivere" });
      assert.notEqual(r.isError, true);
      assert.equal(r.structuredContent?.ok, false);
      assert.match(r.structuredContent?.motivo, /progetto/);
      assert.equal((await b.db.selectFrom("sessioni").select("session_id").where("session_id", "=", "web-0").execute()).length, 0);
      assert.equal((await b.db.selectFrom("stati").select("id").where("session_id", "=", "web-0").execute()).length, 0);
    });

    test("session_id sconosciuto con il progetto: lavoro diretto, due resoconti, stato_sessione mostra l'ultimo", async () => {
      const primo = await chiama("aggiorna_stato", { session_id: "web-1", fatto: "letto il codice", prossimo: "scrivere i test", progetto: "mercurius" });
      assert.deepEqual([primo.structuredContent?.ok, primo.structuredContent?.cantiere], [true, null]);
      await chiama("aggiorna_stato", { session_id: "web-1", fatto: "scritti i test", prossimo: "rivedere", bloccato_da: "manca il token", percentuale: 40 });
      const stati = await b.db.selectFrom("stati").selectAll().where("session_id", "=", "web-1").execute();
      assert.equal(stati.length, 2);
      assert.ok(stati.every((s) => s.cantiere_id === null && s.progetto_id !== null));
      const s = await b.db.selectFrom("sessioni").selectAll().where("session_id", "=", "web-1").executeTakeFirstOrThrow();
      assert.deepEqual([s.host, s.cwd, s.cantiere_id], ["mcp", "", null]);
      const stato = await chiama("stato_sessione", { session_id: "web-1" });
      assert.deepEqual([stato.structuredContent?.progetto, stato.structuredContent?.cantiere], ["mercurius", null]);
      assert.deepEqual(
        { ...stato.structuredContent?.ultimo_stato, ts: undefined },
        { ts: undefined, fatto: "scritti i test", prossimo: "rivedere", bloccato_da: "manca il token", percentuale: 40 },
      );
      assert.match(stato.content[0].text, /Lavoro diretto su mercurius/);
    });

    test("precedenza via MCP: rifiuto chiaro, non un errore, cantiere invariato", async () => {
      await apri(b, "u1", "pdfconverter");
      const r = await chiama("apri_cantiere", { session_id: "u1", nome: "refactoring-db" });
      assert.notEqual(r.isError, true);
      assert.equal(r.structuredContent?.ok, false);
      assert.match(r.structuredContent?.motivo, /Non riprovare/);
      assert.equal((await chiama("stato_sessione", { session_id: "u1" })).structuredContent?.cantiere.percorso, "pdfconverter");
    });

    test("apri via MCP: progetto della sessione, change, comando per crearlo, traccia negli eventi", async () => {
      await invia(b, evento("session_start", { source: "startup" }, { session_id: "m1" }));
      const aperto = await chiama("apri_cantiere", { session_id: "m1", nome: "mcp-prova" });
      assert.deepEqual(
        { ...aperto.structuredContent?.cantiere, id: 0 },
        { id: 0, nome: "mcp-prova", percorso: "mcp-prova", origine: "claude", stato: "aperto", change: "mcp-prova" },
      );
      assert.match(aperto.content[0].text, /openspec new change mcp-prova/);
      const tipi = await b.db.selectFrom("eventi").select("tipo").where("session_id", "=", "m1").orderBy("id").execute();
      assert.deepEqual(tipi.map((t) => t.tipo), ["session_start", "apri_cantiere"]);
      await copia(b, { attivi: [changeAttivo("mcp-prova")], archiviati: [] });
      const dinuovo = await chiama("apri_cantiere", { session_id: "m2", nome: "mcp-prova", progetto: "app" });
      assert.doesNotMatch(dinuovo.content[0].text, /openspec new change/);
      const senza = await chiama("apri_cantiere", { session_id: "mai-vista", nome: "x" });
      assert.equal(senza.structuredContent?.ok, false);
    });

    test("ramo via MCP: task nel tool, il risultato dice da dove è nato", async () => {
      await apri(b, "r1", "partenza");
      const r = await chiama("apri_cantiere", { session_id: "r1", nome: "ramo-mcp", origine: "utente", task: "2.1" });
      assert.match(r.content[0].text, /Nato da "app\/partenza" \(task 2\.1\)\./);
    });

    test("un'idea aperta via MCP: rifiuto che dice di prenderla", async () => {
      await creaIdea(b, TUTTI, b.progetto.id, { nome: "idoc-converter" });
      const r = await chiama("apri_cantiere", { session_id: "i1", nome: "idoc-converter", progetto: "app" });
      assert.equal(r.structuredContent?.ok, false);
      assert.match(r.structuredContent?.motivo, /\/cantiere prendi idoc-converter/);
    });

    test("elenca_cantieri: due host sullo stesso cantiere, idee per progetto, solo il committente del token", async () => {
      await apri(b, "p1", "condiviso", "utente", { host: "portatile" });
      await apri(b, "f1", "condiviso", "utente", { host: "fisso", branch: "dev" });
      await chiama("aggiorna_stato", { session_id: "f1", fatto: "migrata la tabella", prossimo: "test" });
      const { structuredContent } = await chiama("elenca_cantieri", {});
      const c = structuredContent?.cantieri.find((x: { percorso: string }) => x.percorso === "condiviso");
      const perHost = Object.fromEntries(c.sessioni.map((s: any) => [s.host, s]));
      assert.deepEqual(Object.keys(perHost).sort(), ["fisso", "portatile"]);
      assert.deepEqual([perHost.fisso.branch, perHost.fisso.fatto, perHost.fisso.prossimo], ["dev", "migrata la tabella", "test"]);
      assert.equal(typeof perHost.portatile.eta_secondi, "number");
      await creaIdea(b, TUTTI, b.progetto.id, { nome: "report" });
      const idee = (await chiama("elenca_cantieri", { progetto: "app", stati: ["idea"] })).structuredContent?.cantieri.map((x: any) => x.percorso);
      assert.ok(idee.includes("report") && !idee.includes("condiviso"));
      const priv = await b.altroCommittente(`PRIV${era.length}`, ["app"]);
      const altro = await connetti(b, priv.token, versionNegotiation);
      try {
        assert.deepEqual((await altro.callTool({ name: "elenca_cantieri", arguments: {} }) as Risultato).structuredContent?.cantieri, []);
        const sessioneAltrui = (await altro.callTool({ name: "stato_sessione", arguments: { session_id: "f1" } })) as Risultato;
        assert.deepEqual(sessioneAltrui.structuredContent, { progetto: null, cantiere: null, ultimo_stato: null, todo: [] });
      } finally {
        await altro.close();
      }
    });

    test("descrizioni: quando usare, limiti, divieti", async () => {
      const { tools } = await client.listTools();
      const descrizione = (nome: string) => tools.find((t) => t.name === nome)?.description ?? "";
      assert.match(descrizione("aggiorna_stato"), /~200 caratteri/);
      assert.match(descrizione("aggiorna_stato"), /segreti/);
      assert.match(descrizione("aggiorna_stato"), /dati personali/);
      assert.match(descrizione("aggiorna_stato"), /bloccato_da solo se c'è un blocco vero/);
      assert.match(descrizione("apri_cantiere"), /origine "utente" solo se l'utente ha scelto o nominato/);
      assert.match(descrizione("apri_cantiere"), /pdfconverter/);
      assert.match(descrizione("apri_cantiere"), /primo livello del progetto/);
      assert.match(descrizione("apri_cantiere"), /openspec new change <change>/);
      assert.match(descrizione("apri_cantiere"), /non insistere/);
      assert.match(descrizione("apri_cantiere"), /il legame con quello di partenza si registra da solo/);
    });
  });
}

describe("trasporto MCP", () => {
  let b: Banco;
  before(async () => (b = await avvia({ public_host: "forgia.example.org" })));
  after(() => b.chiudi());

  const post = (host: string, token: string | null = b.token) =>
    new Promise<number>((ok, ko) => {
      const corpo = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
      const req = request(`${b.url}/mcp`, {
        method: "POST",
        headers: { host, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", accept: "application/json, text/event-stream" },
      });
      req.on("response", (res) => (res.resume(), ok(res.statusCode ?? 0))).on("error", ko);
      req.end(corpo);
    });

  test("401 senza token", async () => assert.equal(await post("127.0.0.1", null), 401));
  test("host non ammesso: 403", async () => assert.equal(await post("altro.example.com"), 403));
  test("host pubblico e localhost con porta: ammessi", async () => {
    assert.notEqual(await post("forgia.example.org"), 403);
    assert.notEqual(await post(new URL(b.url).host), 403);
  });
  test("GET su /mcp: 405", async () => {
    const r = await fetch(`${b.url}/mcp`, { headers: { authorization: `Bearer ${b.token}`, accept: "text/event-stream" } });
    assert.equal(r.status, 405);
  });
});
