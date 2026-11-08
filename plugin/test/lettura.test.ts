// forgia cerca, forgia leggi e il server MCP del plugin (forgia mcp), contro un server finto.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, test } from "node:test";
import { ambiente, esegui, portaChiusa, SCRIPT, serverFinto, TOKEN } from "./aiuti.ts";

const NON_COLLEGATA = "questa cartella non è collegata a cantiere forgia: lancia /cantiere collega <progetto> <url>";
const TROVATI = { cantieri: [{ progetto: "HMS", percorso: "adonis", stato: "idea", descrizione: "istruzioni", file: ["idee/istruzioni.md"] }] };
const ELENCO = {
  progetto: "prova", percorso: "adonis", stato: "idea",
  file: [{ nome: "idee/grande.md", origine: "idea", byte: 300000, aggiornato_il: "2026-11-08T10:00:00.000Z", errore: 'Il file "idee/grande.md" supera 262144 byte.' },
    { nome: "idee/istruzioni.md", origine: "idea", byte: 7, aggiornato_il: "2026-11-08T10:00:00.000Z", contenuto: "# fare\n" }],
};

async function preparato(t: { after: (f: () => unknown) => void }, rispondi?: Parameters<typeof serverFinto>[0]) {
  const srv = await serverFinto(rispondi);
  const amb = ambiente();
  t.after(async () => { await srv.chiudi(); amb.pulisci(); });
  return { srv, amb, opz: { env: amb.env, cwd: amb.progetto } };
}

describe("cerca e leggi", () => {
  test("fuori da un'area: errore che indica /cantiere collega, nessuna richiesta", async (t) => {
    const { srv, opz } = await preparato(t);
    for (const comando of [["cerca", "x"], ["leggi", "x"]]) {
      const r = await esegui(comando, opz);
      assert.deepEqual([r.codice, r.stderr.trim()], [1, NON_COLLEGATA]);
    }
    assert.equal(srv.richieste.length, 0);
  });

  test("cerca: le parole e il progetto all'API con il token dell'area, mai nell'output", async (t) => {
    const { srv, amb, opz } = await preparato(t, (r) => (r.percorso.startsWith("/api/v1/cerca") ? { corpo: TROVATI } : undefined));
    amb.configura({ url: srv.url });
    const r = await esegui(["cerca", "istruzioni", "adonis", "--progetto", "HMS"], opz);
    assert.equal(r.codice, 0, r.stderr);
    assert.deepEqual(srv.richieste.map((x) => [x.metodo, x.percorso, x.auth]), [["GET", "/api/v1/cerca?testo=istruzioni+adonis&progetto=HMS", `Bearer ${TOKEN}`]]);
    assert.equal(r.stdout, 'HMS/adonis (idea): istruzioni\n  idee/istruzioni.md\nPer leggerli: forgia leggi "<percorso>" [file] --progetto <progetto>\n');
    assert.deepEqual(JSON.parse((await esegui(["cerca", "adonis", "--json"], opz)).stdout), TROVATI.cantieri);
    assert.ok(!r.stdout.includes(TOKEN));
  });

  test("cerca senza risultati lo dice", async (t) => {
    const { srv, amb, opz } = await preparato(t, () => ({ corpo: { cantieri: [] } }));
    amb.configura({ url: srv.url });
    assert.match((await esegui(["cerca", "zebra"], opz)).stdout, /Nessun cantiere di PRIV con "zebra"/);
  });

  test("leggi senza file: elenco e contenuti in una richiesta, con il progetto dell'area; un file che non si legge non ferma gli altri", async (t) => {
    const { srv, amb, opz } = await preparato(t, () => ({ corpo: ELENCO }));
    amb.configura({ url: srv.url });
    const r = await esegui(["leggi", "adonis"], opz);
    assert.equal(r.codice, 0, r.stderr);
    assert.deepEqual(srv.richieste.map((x) => [x.percorso, x.auth]), [["/api/v1/progetti/prova/cantieri/adonis/file?contenuto=1", `Bearer ${TOKEN}`]]);
    assert.equal(r.stdout, [
      'Cantiere "adonis" (prova, idea): 2 file.', "- idee/grande.md (idea, 300000 byte)", "- idee/istruzioni.md (idea, 7 byte)",
      "", "===== idee/grande.md =====", '(non letto: Il file "idee/grande.md" supera 262144 byte.)',
      "", "===== idee/istruzioni.md =====", "# fare\n",
    ].join("\n") + "\n");
    assert.deepEqual(JSON.parse((await esegui(["leggi", "adonis", "--json"], opz)).stdout), ELENCO);
  });

  test("leggi un file: percorso a livelli, nome nella query (un proxy decodifica le barre nel percorso), --progetto; stampa solo il contenuto", async (t) => {
    const { srv, amb, opz } = await preparato(t, () => ({ corpo: { nome: "specs/x/spec.md", contenuto: "## Requisiti" } }));
    amb.configura({ url: srv.url });
    const r = await esegui(["leggi", "tassi BCE/fase uno", "specs/x/spec.md", "--progetto", "mercurius"], opz);
    assert.deepEqual([r.codice, r.stdout], [0, "## Requisiti\n"]);
    assert.equal(srv.richieste[0].percorso, "/api/v1/progetti/mercurius/cantieri/tassi%20BCE/fase%20uno/file?nome=specs%2Fx%2Fspec.md");
    const troppi = await esegui(["leggi", "tassi", "BCE", "x.md"], opz);
    assert.deepEqual([troppi.codice, /tra virgolette/.test(troppi.stderr)], [1, true]);
  });

  test("leggi: cantiere inesistente o token rifiutato, il motivo senza il token", async (t) => {
    let codice = 404;
    const { srv, amb, opz } = await preparato(t, () => ({ codice, corpo: { errore: 'Il cantiere "x" non esiste in prova.' } }));
    amb.configura({ url: srv.url });
    const assente = await esegui(["leggi", "x"], opz);
    assert.deepEqual([assente.codice, assente.stderr.trim()], [1, 'il server risponde 404: Il cantiere "x" non esiste in prova.']);
    codice = 401;
    const rifiutato = await esegui(["leggi", "x"], opz);
    assert.deepEqual([rifiutato.codice, rifiutato.stderr.trim()], [1, "token non valido: il server risponde 401"]);
    assert.ok(![assente, rifiutato].some((r) => (r.stdout + r.stderr).includes(TOKEN)));
  });

  test("server più vecchio del plugin (404 senza corpo): dice di aggiornarlo, non di controllare l'URL", async (t) => {
    const { srv, amb, opz } = await preparato(t, () => ({ codice: 404, vuoto: true }));
    amb.configura({ url: srv.url });
    for (const comando of [["cerca", "x"], ["leggi", "x"]]) {
      const r = await esegui(comando, opz);
      assert.deepEqual([r.codice, r.stderr.trim()], [1, `il server ${srv.url} non conosce questa richiesta: va aggiornato alla versione del plugin`]);
    }
  });
});

// Il server MCP del plugin come lo lancia Claude Code: JSON-RPC su stdin e stdout, una riga per messaggio.
function proxy(env: Record<string, string>, cwd: string) {
  const p = spawn(process.execPath, [SCRIPT, "mcp"], { env, cwd });
  const attese = new Map<number, (m: any) => void>();
  const altri: any[] = [];
  createInterface({ input: p.stdout }).on("line", (riga) => {
    const m = JSON.parse(riga);
    const attesa = attese.get(m.id);
    if (attesa) attese.delete(m.id), attesa(m);
    else altri.push(m);
  });
  let id = 0;
  return {
    altri,
    chiedi: (method: string, params: object = {}) => new Promise<any>((ok) => {
      attese.set(++id, ok);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    }),
    scrivi: (riga: string) => p.stdin.write(riga + "\n"),
    chiudi: () => new Promise<number | null>((ok) => (p.on("close", ok), p.stdin.end())),
  };
}

const STRUMENTI = { tools: [{ name: "leggi_cantiere", inputSchema: { type: "object" } }] };
const CHIAMATA = { name: "leggi_cantiere", arguments: { percorso: "adonis" } };
const LETTO = { content: [{ type: "text", text: "1 file" }], structuredContent: { ok: true, file: [] } };

describe("server MCP del plugin", () => {
  test("fuori da un'area e senza elenchi visti: handshake, nessun tool, chiamata con ok false e il motivo", async (t) => {
    const amb = ambiente();
    t.after(() => amb.pulisci());
    const mcp = proxy(amb.env, amb.progetto);
    const init = await mcp.chiedi("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.deepEqual([init.result.protocolVersion, init.result.capabilities, init.result.serverInfo.name], ["2025-06-18", { tools: { listChanged: true } }, "forgia"]);
    mcp.scrivi(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    assert.deepEqual((await mcp.chiedi("tools/list")).result, { tools: [] });
    const r = await mcp.chiedi("tools/call", CHIAMATA);
    assert.deepEqual(r.result, { content: [{ type: "text", text: `Rifiutato. ${NON_COLLEGATA}` }], structuredContent: { ok: false, cantiere: null, motivo: NON_COLLEGATA } });
    assert.deepEqual((await mcp.chiedi("resources/list")).error.code, -32601);
    assert.deepEqual((await mcp.chiedi("ping")).result, {});
    assert.equal(await mcp.chiudi(), 0);
    assert.deepEqual(mcp.altri, []);
  });

  test("in un'area: inoltra al server con il token dell'area, legge l'SSE e ricorda l'elenco per le cartelle non collegate", async (t) => {
    const srv = await serverFinto((r) => (r.percorso === "/mcp" ? { sse: true, corpo: { jsonrpc: "2.0", id: r.corpo.id, result: r.corpo.method === "tools/list" ? STRUMENTI : LETTO } } : undefined));
    const amb = ambiente();
    t.after(async () => { await srv.chiudi(); amb.pulisci(); });
    amb.configura({ url: srv.url });
    const mcp = proxy(amb.env, join(amb.progetto));
    assert.deepEqual((await mcp.chiedi("tools/list")).result, STRUMENTI);
    assert.deepEqual((await mcp.chiedi("tools/call", CHIAMATA)).result, LETTO);
    assert.deepEqual(srv.richieste.map((r) => [r.metodo, r.percorso, r.auth, r.corpo.method]), [
      ["POST", "/mcp", `Bearer ${TOKEN}`, "tools/list"], ["POST", "/mcp", `Bearer ${TOKEN}`, "tools/call"],
    ]);
    assert.deepEqual(srv.richieste[1].corpo.params, CHIAMATA);
    await mcp.chiudi();
    const fuori = join(amb.dir, "fuori");
    mkdirSync(fuori);
    const altrove = proxy(amb.env, fuori);
    assert.equal((await altrove.chiedi("tools/call", CHIAMATA)).result.structuredContent.motivo, NON_COLLEGATA);
    rmSync(amb.cache("strumenti.json"));
    assert.deepEqual((await altrove.chiedi("tools/list")).result, STRUMENTI, "fuori dalle aree, l'elenco di un'area");
    await altrove.chiudi();
    assert.equal(srv.richieste.length, 3);
  });

  test("rifiuti HTTP del server (429, 403 della guardia sull'host): ok false con il motivo e l'id giusto; l'elenco ripiega sull'ultimo visto", async (t) => {
    const rifiuti = [
      { codice: 429, corpo: { errore: "Troppe richieste: riprova tra un minuto." } },
      { codice: 403, corpo: { jsonrpc: "2.0", error: { code: -32000, message: "Invalid Host header" }, id: null } },
    ];
    let n = 0;
    const srv = await serverFinto(() => rifiuti[n++ % 2]);
    const amb = ambiente();
    t.after(async () => { await srv.chiudi(); amb.pulisci(); });
    amb.configura({ url: srv.url });
    const mcp = proxy(amb.env, amb.progetto);
    const troppe = await mcp.chiedi("tools/call", CHIAMATA);
    assert.deepEqual([troppe.id, troppe.result.structuredContent.motivo], [1, "il server risponde 429: Troppe richieste: riprova tra un minuto."]);
    const guardia = await mcp.chiedi("tools/call", CHIAMATA);
    assert.deepEqual([guardia.id, guardia.result.structuredContent.motivo], [2, "il server risponde 403: Invalid Host header"]);
    assert.deepEqual((await mcp.chiedi("tools/list")).result, { tools: [] });
    await mcp.chiudi();
  });

  test("server giù: la chiamata risponde ok false con il motivo, senza il token; l'elenco resta l'ultimo visto", async (t) => {
    const amb = ambiente();
    t.after(() => amb.pulisci());
    const url = await portaChiusa();
    amb.configura({ url });
    mkdirSync(amb.cache(), { recursive: true });
    writeFileSync(amb.cache("strumenti.json"), JSON.stringify(STRUMENTI));
    const mcp = proxy(amb.env, amb.progetto);
    assert.deepEqual((await mcp.chiedi("tools/list")).result, STRUMENTI);
    const r = await mcp.chiedi("tools/call", CHIAMATA);
    assert.deepEqual(r.result.structuredContent, { ok: false, cantiere: null, motivo: `server non raggiungibile: ${url}` });
    assert.ok(!JSON.stringify(r).includes(TOKEN));
    await mcp.chiudi();
  });

  test("la cartella si collega a sessione aperta: avvisa che l'elenco dei tool è cambiato e le chiamate partono", async (t) => {
    const srv = await serverFinto((r) => (r.percorso === "/mcp" ? { corpo: { jsonrpc: "2.0", id: r.corpo.id, result: LETTO } } : undefined));
    const amb = ambiente();
    t.after(async () => { await srv.chiudi(); amb.pulisci(); });
    const mcp = proxy(amb.env, amb.progetto);
    assert.equal((await mcp.chiedi("tools/call", CHIAMATA)).result.structuredContent.ok, false);
    amb.configura({ url: srv.url });
    for (let i = 0; i < 50 && !mcp.altri.length; i++) await new Promise((ok) => setTimeout(ok, 100));
    assert.deepEqual(mcp.altri, [{ jsonrpc: "2.0", method: "notifications/tools/list_changed" }]);
    assert.deepEqual((await mcp.chiedi("tools/call", CHIAMATA)).result, LETTO);
    await mcp.chiudi();
  });
});

describe("list", () => {
  const C = (id: number, percorso: string, stato: string, altro: object = {}) => ({
    id, progetto: "prova", percorso, padre_id: null, stato, stato_il: "2026-11-01T10:00:00.000Z", change: percorso.replaceAll("/", "-"), descrizione: null,
    task: null, fasi: null, domande_in_attesa: 0, nato_da: [], file_idea_nomi: [], sessioni: [], ...altro,
  });
  const CANTIERI = [
    C(12, "analisi", "aperto", {
      descrizione: "costi", task: { fatti: 3, totali: 7 }, fasi: { completate: 0, totali: 1 }, domande_in_attesa: 1,
      nato_da: [{ progetto: "altro", percorso: "partenza", task: "2.1" }],
      sessioni: [{ host: "mine", branch: "main", stato: "attiva", fatto: "scritto il server", prossimo: "la UI" }],
    }),
    C(13, "analisi/fase", "idea", { padre_id: 12, file_idea_nomi: ["a.md", "b.md"] }),
    C(14, "vecchio", "completato"),
    C(15, "remoto", "idea", { progetto: "altro" }),
  ];
  // Come il server: con ?progetto= solo i cantieri di quel progetto.
  const conCantieri = (t: Parameters<typeof preparato>[0]) => preparato(t, (r) => {
    if (!r.percorso.startsWith("/api/v1/cantieri")) return undefined;
    const progetto = new URL(r.percorso, "http://x").searchParams.get("progetto");
    return { corpo: { cantieri: CANTIERI.filter((c) => !progetto || c.progetto === progetto) } };
  });

  test("senza argomenti: idee, aperti e sospesi del progetto dell'area, per stato, col token dell'area mai nell'output", async (t) => {
    const { srv, amb, opz } = await conCantieri(t);
    amb.configura({ url: srv.url });
    const r = await esegui(["list"], opz);
    assert.equal(r.codice, 0, r.stderr);
    assert.deepEqual(srv.richieste.map((x) => [x.percorso, x.auth]), [["/api/v1/cantieri?progetto=prova", `Bearer ${TOKEN}`]]);
    assert.equal(r.stdout, [
      "PRIV/prova: 2 cantieri (1 altro in altri stati: forgia list tutti).", "",
      "Aperti", "  #12 analisi · task 3/7 · fasi 0/1 · 1 sessione attiva · 1 domanda in attesa · dal 2026-11-01", "",
      "Idee", "  #13 analisi/fase · 2 file · dal 2026-11-01", "",
      "Scheda di uno: forgia list #<numero>. Per entrarci: /cantiere prendi #<numero>.", "",
    ].join("\n"));
    assert.ok(!r.stdout.includes(TOKEN));
  });

  test("stati scelti e tutti i progetti; --json; uno stato che non c'è", async (t) => {
    const { srv, amb, opz } = await conCantieri(t);
    amb.configura({ url: srv.url });
    const chiusi = await esegui(["list", "chiusi", "--ovunque"], opz);
    assert.equal(srv.richieste[0].percorso, "/api/v1/cantieri");
    assert.match(chiusi.stdout, /^PRIV: 1 cantiere \(3 altri in altri stati: forgia list tutti --ovunque\)\./);
    assert.match(chiusi.stdout, /\nCompletati\n  #14 prova\/vecchio · dal 2026-11-01\n\n/);
    assert.doesNotMatch(chiusi.stdout, /Abbandonati|Idee/);
    assert.deepEqual(JSON.parse((await esegui(["list", "Idee", "--ovunque", "--json"], opz)).stdout).map((c: any) => c.id), [15, 13]);
    const male = await esegui(["list", "finiti"], opz);
    assert.deepEqual([male.codice, male.stderr.trim()], [1, "stato sconosciuto: finiti. Usa idee, aperti, sospesi, chiusi, completati, abbandonati o tutti, oppure #<numero>"]);
  });

  test("#<numero>: la scheda, cercata in tutto il committente, con fasi, sessioni e i comandi per entrarci o leggerlo", async (t) => {
    const { srv, amb, opz } = await conCantieri(t);
    amb.configura({ url: srv.url });
    const r = await esegui(["list", "#12"], opz);
    assert.equal(r.codice, 0, r.stderr);
    assert.equal(srv.richieste[0].percorso, "/api/v1/cantieri");
    assert.equal(r.stdout, [
      "#12 analisi (prova)", "stato: aperto dal 2026-11-01 · change analisi", "descrizione: costi", "task 3/7 · fasi 0/1",
      "  fase #13 analisi/fase (idea)", "nato da: altro/partenza (task 2.1)", "sessione: mine · main · attiva · fatto: scritto il server · prossimo: la UI",
      "1 domanda in attesa", "Per entrarci: /cantiere prendi #12", 'Per leggerne i file: /cantiere leggi "analisi"', "",
    ].join("\n"));
    const remoto = (await esegui(["list", "#15"], opz)).stdout;
    assert.match(remoto, /Per entrarci: \/cantiere prendi #15 da una cartella di altro\nPer leggerne i file: \/cantiere leggi "remoto" --progetto "altro"/);
    assert.doesNotMatch((await esegui(["list", "#14"], opz)).stdout, /Per entrarci/);
    const assente = await esegui(["list", "#99"], opz);
    assert.deepEqual([assente.codice, assente.stderr.trim()], [1, "il cantiere #99 non c'è tra quelli di PRIV"]);
  });

  test("fuori da un'area: errore che indica /cantiere collega, nessuna richiesta", async (t) => {
    const { srv, opz } = await conCantieri(t);
    const r = await esegui(["list"], opz);
    assert.deepEqual([r.codice, r.stderr.trim(), srv.richieste.length], [1, NON_COLLEGATA, 0]);
  });
});
