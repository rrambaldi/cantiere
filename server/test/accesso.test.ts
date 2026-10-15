import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, describe, test } from "node:test";
import { creaRateLimit, hashToken, rigeneraToken } from "../src/accesso.ts";
import { avvia, changeAttivo, copia, evento, invia, richiesta, type Banco } from "./aiuto.ts";

describe("accesso", () => {
  let b: Banco;
  before(async () => (b = await avvia()));
  after(() => b.chiudi());

  test("senza token, malformato o sconosciuto: 401 senza dettagli", async () => {
    for (const token of [null, "", "sbagliato"]) {
      const r = await invia(b, evento("prompt", {}), token);
      assert.equal(r.status, 401);
      assert.equal(r.corpo, null);
    }
    const r = await richiesta(b, "/api/v1/salute", { headers: { authorization: `Basic ${b.token}` } }, null);
    assert.equal(r.status, 401);
  });

  test("token sostituito da una rigenerazione: 401 su REST e su MCP", async () => {
    const { committente, token } = await b.altroCommittente("Vecchio", []);
    assert.equal((await richiesta(b, "/api/v1/salute", {}, token)).status, 200);
    await rigeneraToken(b.db, { id: committente.id });
    assert.equal((await richiesta(b, "/api/v1/salute", {}, token)).status, 401);
    const mcp = await fetch(`${b.url}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(mcp.status, 401);
  });

  test("nel database c'è solo l'hash del token", async () => {
    const righe = await b.db.selectFrom("committenti").select("token_hash").execute();
    assert.ok(righe.some((r) => r.token_hash === hashToken(b.token)));
    assert.ok(righe.every((r) => r.token_hash !== b.token && /^[0-9a-f]{64}$/.test(r.token_hash)));
  });

  test("salute: 200 con versione 2 e il nome del committente", async () => {
    const r = await richiesta(b, "/api/v1/salute");
    assert.deepEqual(r, { status: 200, corpo: { ok: true, versione_contratto: 2, cliente: "CVSTUDIO" } });
  });

  test("corpo oltre max_body: 413 con e senza Content-Length, niente salvato", async () => {
    const grande = JSON.stringify(evento("todo", { strumento: "x", completo: true, todos: [] }, { cwd: "x".repeat(65 * 1024) }));
    assert.equal((await invia(b, JSON.parse(grande))).status, 413);
    const senzaLunghezza = await new Promise<number>((ok, ko) => {
      const req = request(`${b.url}/api/v1/eventi`, {
        method: "POST",
        headers: { authorization: `Bearer ${b.token}`, "content-type": "application/json", "transfer-encoding": "chunked" },
      });
      req.on("response", (res) => ok(res.statusCode ?? 0)).on("error", ko);
      for (let i = 0; i < 65; i++) req.write("x".repeat(1024));
      req.end();
    });
    assert.equal(senzaLunghezza, 413);
    assert.equal((await b.db.selectFrom("eventi").select("id").execute()).length, 0);
  });

  test("copia dei change da 300 KB accettata (max_openspec), oltre il limite 413", async () => {
    const file = Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`specs/a${i}/spec.md`, "x".repeat(100 * 1024)]));
    assert.equal((await copia(b, { attivi: [changeAttivo("grande", file)], archiviati: [] })).status, 200);
    const piccolo = await avvia({ max_openspec: 1024 });
    try {
      assert.equal((await copia(piccolo, { attivi: [changeAttivo("x", { "proposal.md": "y".repeat(2000) })], archiviati: [] })).status, 413);
    } finally {
      await piccolo.chiudi();
    }
  });

  test("log: tipo, session_id, committente ed esito, mai token, testi o contenuti dei file", async () => {
    await invia(b, evento("todo", { strumento: "TodoWrite", completo: true, todos: [{ id: null, testo: "migrare la tabella clienti", stato: "pending" }] }));
    await copia(b, { attivi: [changeAttivo("segreto-change", { "proposal.md": "contenuto riservato del file" })], archiviati: [] });
    const righe = b.log.map((r) => JSON.stringify(r));
    assert.ok(b.log.some((r) => r.tipo === "todo" && r.session_id === "s1" && r.committente === "CVSTUDIO" && r.esito === 200));
    assert.ok(b.log.some((r) => r.tipo === "PUT openspec" && r.committente === "CVSTUDIO" && r.esito === 200));
    assert.ok(righe.every((r) => !r.includes("migrare la tabella") && !r.includes(b.token) && !r.includes("contenuto riservato") && !r.includes("segreto-change")));
  });
});

test("rate limit: la richiesta 121 nello stesso minuto è rifiutata, per committente", () => {
  let ora = 60_000 * 1000;
  const consentito = creaRateLimit(120, () => ora);
  for (let i = 0; i < 120; i++) assert.equal(consentito(1), true);
  assert.equal(consentito(1), false);
  assert.equal(consentito(2), true, "un altro committente non si somma");
  ora += 60_000;
  assert.equal(consentito(1), true, "minuto nuovo");
});

test("rate limit via HTTP: 429 oltre il limite, committenti indipendenti", async () => {
  const b = await avvia({ rate_limit: 3 });
  try {
    const altro = await b.altroCommittente("PRIV", []);
    const codici = [];
    for (let i = 0; i < 4; i++) codici.push((await richiesta(b, "/api/v1/salute")).status);
    // ParceEtRecte: se il test scavalca il cambio di minuto il quarto passa; succede di rado.
    assert.deepEqual(codici, [200, 200, 200, 429]);
    assert.equal((await richiesta(b, "/api/v1/salute", {}, altro.token)).status, 200);
  } finally {
    await b.chiudi();
  }
});
