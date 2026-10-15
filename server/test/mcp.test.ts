import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, describe, test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { avvia, evento, invia, type Banco } from "./aiuto.ts";

type Risultato = { content: { type: string; text: string }[]; structuredContent?: Record<string, any>; isError?: boolean };

for (const [era, versionNegotiation] of [
  ["2025 (handshake)", undefined],
  ["2026-07-28", { mode: { pin: "2026-07-28" } }],
] as const) {
  describe(`tool MCP, protocollo ${era}`, () => {
    let b: Banco;
    let client: Client;
    before(async () => {
      b = await avvia();
      client = new Client({ name: "test", version: "1" }, versionNegotiation ? { versionNegotiation } : undefined);
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${b.url}/mcp`), { requestInit: { headers: { authorization: `Bearer ${b.token}` } } }),
      );
    });
    after(async () => {
      await client.close();
      await b.chiudi();
    });
    const chiama = async (name: string, args: Record<string, unknown>) =>
      (await client.callTool({ name, arguments: args })) as Risultato;

    test("elenco dei cinque tool", async () => {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), ["aggiorna_stato", "apri_cantiere", "chiudi_cantiere", "elenca_cantieri", "stato_sessione"]);
    });

    test("aggiorna_stato con session_id sconosciuto crea la sessione; stato_sessione mostra l'ultimo", async () => {
      const primo = await chiama("aggiorna_stato", { session_id: "web-1", fatto: "letto il codice", prossimo: "scrivere i test" });
      assert.equal(primo.isError, undefined);
      assert.equal(primo.structuredContent?.cantiere.nome, "senza-cartella");
      await chiama("aggiorna_stato", { session_id: "web-1", fatto: "scritti i test", prossimo: "rivedere", bloccato_da: "manca il token", percentuale: 40 });
      const s = await b.db.selectFrom("sessioni").selectAll().where("session_id", "=", "web-1").executeTakeFirstOrThrow();
      assert.deepEqual([s.host, s.cwd], ["mcp", ""]);
      const c = await b.db.selectFrom("cantieri").selectAll().where("id", "=", s.cantiere_id).executeTakeFirstOrThrow();
      assert.ok(c.aggiornato_il > c.creato_il, "il resoconto aggiorna il cantiere");
      const stato = await chiama("stato_sessione", { session_id: "web-1" });
      assert.deepEqual(
        { ...stato.structuredContent?.ultimo_stato, ts: undefined },
        { ts: undefined, fatto: "scritti i test", prossimo: "rivedere", bloccato_da: "manca il token", percentuale: 40 },
      );
      assert.ok(stato.content[0].text.length > 0);
    });

    test("test 5 via MCP: rifiuto chiaro, non un errore, cantiere invariato", async () => {
      await invia(b, evento("apri_cantiere", { nome: "oauth-logiquo", descrizione: null, origine: "utente" }, { session_id: "u1" }));
      const r = await chiama("apri_cantiere", { session_id: "u1", nome: "refactoring-db" });
      assert.notEqual(r.isError, true);
      assert.equal(r.structuredContent?.ok, false);
      assert.match(r.structuredContent?.motivo, /Non riprovare/);
      const stato = await chiama("stato_sessione", { session_id: "u1" });
      assert.equal(stato.structuredContent?.cantiere.nome, "oauth-logiquo");
    });

    test("apri e chiudi via MCP lasciano traccia negli eventi", async () => {
      const aperto = await chiama("apri_cantiere", { session_id: "m1", nome: "mcp-prova" });
      assert.deepEqual(aperto.structuredContent?.cantiere, { id: aperto.structuredContent?.cantiere.id, nome: "mcp-prova", percorso: "mcp-prova", origine: "claude", confermato: true });
      const chiuso = await chiama("chiudi_cantiere", { session_id: "m1", esito: "completato" });
      assert.equal(chiuso.structuredContent?.cantiere, null);
      const tipi = await b.db.selectFrom("eventi").select("tipo").where("session_id", "=", "m1").orderBy("id").execute();
      assert.deepEqual(tipi.map((t) => t.tipo), ["apri_cantiere", "chiudi_cantiere"]);
    });

    test("elenca_cantieri: due host sullo stesso cantiere con l'ultimo resoconto", async () => {
      await invia(b, evento("apri_cantiere", { nome: "condiviso", descrizione: null, origine: "utente" }, { session_id: "p1", host: "portatile" }));
      await invia(b, evento("apri_cantiere", { nome: "condiviso", descrizione: null, origine: "utente" }, { session_id: "f1", host: "fisso", branch: "dev" }));
      await chiama("aggiorna_stato", { session_id: "f1", fatto: "migrata la tabella", prossimo: "test" });
      const { structuredContent } = await chiama("elenca_cantieri", {});
      const c = structuredContent?.cantieri.find((x: { nome: string }) => x.nome === "condiviso");
      const perHost = Object.fromEntries(c.sessioni.map((s: any) => [s.host, s]));
      assert.deepEqual(Object.keys(perHost).sort(), ["fisso", "portatile"]);
      assert.deepEqual([perHost.fisso.branch, perHost.fisso.fatto, perHost.fisso.prossimo], ["dev", "migrata la tabella", "test"]);
      assert.equal(typeof perHost.portatile.eta_secondi, "number");
      assert.ok("stato" in perHost.portatile);
    });

    test("padre e figli via MCP: padre, percorso, rifiuto senza forza, chiusura con forza", async () => {
      const figlio = await chiama("apri_cantiere", { session_id: "h1", nome: "api", padre: "rilascio" });
      assert.equal(figlio.structuredContent?.cantiere.percorso, "rilascio/api");
      await chiama("apri_cantiere", { session_id: "h2", nome: "rilascio" });
      const rifiuto = await chiama("chiudi_cantiere", { session_id: "h2", esito: "completato" });
      assert.notEqual(rifiuto.isError, true);
      assert.equal(rifiuto.structuredContent?.ok, false);
      assert.match(rifiuto.structuredContent?.motivo, /figli aperti: api/);
      assert.match(rifiuto.structuredContent?.motivo, /ok dell'utente/);
      const { structuredContent } = await chiama("elenca_cantieri", {});
      const percorsi = structuredContent?.cantieri.map((c: { percorso: string }) => c.percorso);
      assert.ok(percorsi.includes("rilascio") && percorsi.includes("rilascio/api"));
      const forzata = await chiama("chiudi_cantiere", { session_id: "h2", esito: "completato", forza: true });
      assert.equal(forzata.structuredContent?.ok, true);
      const aperti = (await chiama("elenca_cantieri", {})).structuredContent?.cantieri.map((c: { nome: string }) => c.nome);
      assert.ok(!aperti.includes("rilascio") && !aperti.includes("api"));
    });

    test("descrizioni: quando usare, limiti, divieti", async () => {
      const { tools } = await client.listTools();
      const descrizione = (nome: string) => tools.find((t) => t.name === nome)?.description ?? "";
      assert.match(descrizione("aggiorna_stato"), /~200 caratteri/);
      assert.match(descrizione("aggiorna_stato"), /segreti/);
      assert.match(descrizione("aggiorna_stato"), /dati personali/);
      assert.match(descrizione("aggiorna_stato"), /bloccato_da solo se c'è un blocco vero/);
      assert.match(descrizione("apri_cantiere"), /origine "utente" solo se/);
      assert.match(descrizione("apri_cantiere"), /oauth-logiquo/);
      assert.match(descrizione("apri_cantiere"), /non insistere/);
      assert.match(descrizione("apri_cantiere"), /logiquo-v2\/oauth/);
      assert.match(descrizione("chiudi_cantiere"), /forza .*solo se l'utente l'ha chiesto/);
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
        headers: {
          host,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
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
