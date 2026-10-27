import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { PROGETTI, ambiente, esegui, finto, hook, DATI, RISPOSTA, serverFinto, TOKEN } from "./aiuti.ts";

// Ambiente con un finto `claude` nel PATH che registra cartella e argomenti.
async function preparato(t: { after: (f: () => unknown) => void }, rispondi?: Parameters<typeof serverFinto>[0]) {
  const srv = await serverFinto(rispondi);
  const amb = ambiente();
  t.after(async () => { await srv.chiudi(); amb.pulisci(); });
  const chiamateClaude = finto(amb, "claude");
  const opz = { env: amb.env, cwd: amb.progetto };
  return { srv, amb, opz, chiamateClaude };
}

const progetti = (...nomi: string[]) => ({ progetti: nomi.map((nome, i) => ({ ...PROGETTI.progetti[0], id: i + 1, nome, slug: nome.toLowerCase() })) });
const config = (amb: ReturnType<typeof ambiente>) => JSON.parse(readFileSync(amb.fileConfig, "utf8"));

describe("collega", () => {
  test("verifica, salva l'area della radice git con permessi 0600 e registra il server MCP per quella cartella", async (t) => {
    const { srv, amb, opz, chiamateClaude } = await preparato(t, (r) => (r.percorso === "/api/v1/progetti" ? { corpo: progetti("poker") } : undefined));
    execFileSync("git", ["init", "-q", amb.progetto]);
    const sotto = join(amb.progetto, "src");
    mkdirSync(sotto);
    const r = await esegui(["collega", "Poker", "--url", `${srv.url}/`, "--token-stdin"], { ...opz, cwd: sotto, input: "tok-cvstudio-5678\n" });
    assert.equal(r.codice, 0, r.stderr);
    assert.match(r.stdout, /collegata a PRIV\/poker/);
    assert.match(r.stdout, /\/cantiere permessi/);
    assert.ok(!r.stdout.includes("tok-cvstudio-5678"));
    assert.equal(statSync(amb.fileConfig).mode & 0o777, 0o600);
    const cfg = config(amb);
    assert.deepEqual({ ...cfg, aree: cfg.aree.map((a: any) => ({ ...a, mcp_registrato_il: !!a.mcp_registrato_il })) }, {
      abilitato: true, nome_server_mcp: "forgia", modalita_resoconto: null,
      aree: [{ cartella: amb.progetto, url: srv.url, token: "tok-cvstudio-5678", committente: "PRIV", progetto: "poker", mcp_registrato_il: true }],
    });
    assert.deepEqual(chiamateClaude(), [
      `${amb.progetto}|mcp remove forgia --scope local`,
      `${amb.progetto}|mcp add --transport http --scope local forgia ${srv.url}/mcp --header Authorization: Bearer tok-cvstudio-5678`,
    ]);
    assert.deepEqual(srv.richieste.map((x) => [x.metodo, x.percorso, x.auth]), [
      ["GET", "/api/v1/salute", "Bearer tok-cvstudio-5678"], ["GET", "/api/v1/progetti", "Bearer tok-cvstudio-5678"],
    ]);
  });

  test("progetto inesistente: niente salvato, elenco dei progetti; con --crea lo crea e collega", async (t) => {
    const { srv, amb, opz } = await preparato(t, (r) => (r.percorso === "/api/v1/progetti" && r.metodo === "GET" ? { corpo: progetti("poker", "admin") } : undefined));
    const r = await esegui(["collega", "pokr", "--url", srv.url, "--token-stdin"], { ...opz, input: TOKEN });
    assert.equal(r.codice, 1);
    assert.match(r.stderr, /"pokr" non esiste in PRIV\. Progetti: poker, admin\. Per crearlo: forgia collega pokr --crea/);
    assert.equal(existsSync(amb.fileConfig), false);
    assert.ok(!srv.richieste.some((x) => x.metodo === "POST"));

    const c = await esegui(["collega", "mercurius", "--crea", "--url", srv.url, "--token-stdin"], { ...opz, input: TOKEN });
    assert.equal(c.codice, 0, c.stderr);
    assert.deepEqual(srv.richieste.filter((x) => x.metodo === "POST").map((x) => x.corpo), [{ nome: "mercurius" }]);
    assert.equal(config(amb).aree[0].progetto, "mercurius");
  });

  test("stessa cartella collegata di nuovo con un altro token: una sola area, col token nuovo", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    await esegui(["collega", "prova", "--url", srv.url, "--token-stdin"], { ...opz, input: "tok-vecchio-0001" });
    await esegui(["collega", "prova", "--url", srv.url, "--token-stdin"], { ...opz, input: "tok-nuovo-0002" });
    assert.deepEqual(config(amb).aree.map((a: any) => [a.cartella, a.token]), [[amb.progetto, "tok-nuovo-0002"]]);
  });

  test("sottocartella senza git di un'area: riusa URL e token e crea un'area più specifica", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    amb.configura({ url: srv.url });
    const sotto = join(amb.progetto, "web");
    mkdirSync(sotto);
    const r = await esegui(["collega", "prova"], { ...opz, cwd: sotto });
    assert.equal(r.codice, 0, r.stderr);
    assert.deepEqual(config(amb).aree.map((a: any) => [a.cartella, a.token, a.url]), [[amb.progetto, TOKEN, srv.url], [sotto, TOKEN, srv.url]]);
  });

  test("token sbagliato: errore chiaro e niente salvato", async (t) => {
    const { srv, amb, opz } = await preparato(t, () => ({ codice: 401, corpo: {} }));
    const r = await esegui(["collega", "prova", "--url", srv.url, "--token-stdin"], { ...opz, input: "sbagliato" });
    assert.equal(r.codice, 1);
    assert.match(r.stderr, /token non valido/);
    assert.equal(existsSync(amb.fileConfig), false);
  });

  test("pagina HTML al posto del JSON (proxy davanti, URL senza il percorso del server): dice di controllare l'URL", async (t) => {
    const { amb, opz, srv } = await preparato(t, () => ({ codice: 403, html: "<h3>Accesso riservato</h3>" }));
    const r = await esegui(["collega", "prova", "--url", srv.url, "--token-stdin"], { ...opz, input: TOKEN });
    assert.match(r.stderr, /non risponde cantiere forgia \(HTTP 403\).*controlla l'URL/);
    assert.deepEqual([r.codice, existsSync(amb.fileConfig)], [1, false]);
  });

  test("http verso un host remoto rifiutato", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    const r = await esegui(["collega", "prova", "--url", "http://priv.progettazionisoftware.it/cantiere", "--token-stdin"], { ...opz, input: "x" });
    assert.match(r.stderr, /https/);
    assert.deepEqual([r.codice, srv.richieste.length, existsSync(amb.fileConfig)], [1, 0, false]);
  });

  test("server v1 rifiutato", async (t) => {
    const { srv, amb, opz } = await preparato(t, () => ({ corpo: { ok: true, versione_contratto: 1, cliente: "x" } }));
    const r = await esegui(["collega", "prova", "--url", srv.url, "--token-stdin"], { ...opz, input: "x" });
    assert.match(r.stderr, /versione 1 del contratto, serve la 2/);
    assert.deepEqual([r.codice, existsSync(amb.fileConfig)], [1, false]);
  });

  test("FORGIA_TOKEN e FORGIA_URL bastano; senza claude nel PATH stampa la config a mano senza il token", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    const env = { ...amb.env, PATH: amb.dir, FORGIA_TOKEN: "tok-ambiente-4321", FORGIA_URL: srv.url };
    const r = await esegui(["collega", "prova"], { ...opz, env });
    assert.equal(r.codice, 0, r.stderr);
    assert.match(r.stdout, /"Authorization": "Bearer <token>"/);
    assert.ok(r.stdout.includes(`"projects" → "${amb.progetto}"`));
    assert.ok(!r.stdout.includes("tok-ambiente-4321"));
    const [area] = config(amb).aree;
    assert.deepEqual([area.token, area.mcp_registrato_il], ["tok-ambiente-4321", null]);
  });

  test("token mancante senza terminale: indica FORGIA_TOKEN e il collegamento da terminale, non salva", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    const r = await esegui(["collega", "prova", "--url", srv.url], opz);
    assert.notEqual(r.codice, 0);
    assert.match(r.stderr, /FORGIA_TOKEN/);
    assert.match(r.stderr, /\/bin\/forgia collega prova --url /);
    assert.ok(!existsSync(amb.fileConfig));
  });
});

describe("status, on/off, apri, permetti-mcp", () => {
  test("status --json: area della cartella, aree, token mascherati, server, ultima sessione", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    assert.equal(JSON.parse((await esegui(["status", "--json"], opz)).stdout).in_area, false);
    assert.match((await esegui(["status"], opz)).stdout, /non è collegata.*\/cantiere collega <progetto> <url>/s);
    amb.configura({ url: srv.url });
    const sid = randomUUID();
    await hook("session_start", { ...DATI.session_start, session_id: sid, cwd: amb.progetto }, opz);
    const s = JSON.parse((await esegui(["status", "--json"], opz)).stdout);
    assert.deepEqual([s.in_area, s.abilitato, s.area.committente, s.area.progetto, s.area.token, s.aree.map((a: any) => a.token), s.server, s.ultima_sessione.session_id, s.ultima_sessione.cantiere],
      [true, true, "PRIV", "prova", "…1234", ["…1234"], { raggiungibile: true, cliente: "PRIV" }, sid, "pdfconverter"]);
    const testo = (await esegui(["status"], opz)).stdout;
    assert.match(testo, /tracciamento acceso/);
    assert.match(testo, /PRIV\/prova/);
    assert.ok(!testo.includes(TOKEN));
    const fuori = join(amb.dir, "altrove");
    mkdirSync(fuori);
    const f = JSON.parse((await esegui(["status", "--json"], { ...opz, cwd: fuori })).stdout);
    assert.deepEqual([f.in_area, f.area, f.aree.length], [false, null, 1]);
  });

  test("off spegne gli hook in modo persistente, on li riaccende", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    amb.configura({ url: srv.url });
    const input = { ...DATI.prompt, session_id: randomUUID(), cwd: amb.progetto, prompt: "x" };
    assert.match((await esegui(["off"], opz)).stdout, /spento/);
    await hook("prompt_invio", input, opz);
    assert.equal(srv.richieste.length, 0);
    await esegui(["on"], opz);
    await hook("prompt_invio", input, opz);
    assert.ok(srv.eventi().some((e) => e.tipo === "prompt"));
    assert.equal(config(amb).aree.length, 1);
  });

  test("comandi on|off: per l'area della cartella, spenti di default, e /cantiere stato lo dice", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    amb.configura({ url: srv.url });
    const stato = async () => JSON.parse((await esegui(["status", "--json"], opz)).stdout).area.comandi;
    assert.equal(await stato(), false);
    assert.match((await esegui(["comandi", "on"], opz)).stdout, /accesi per/);
    assert.deepEqual([await stato(), config(amb).aree[0].comandi], [true, true]);
    assert.match((await esegui(["status"], opz)).stdout, /comandi dalla dashboard: accesi/);
    await esegui(["comandi", "off"], opz);
    assert.equal(await stato(), false);
    const uso = await esegui(["comandi", "forse"], opz);
    assert.deepEqual([uso.codice, uso.stderr.trim()], [1, "uso: forgia comandi on|off"]);
    assert.equal((await esegui(["comandi", "on"], { ...opz, cwd: amb.dir })).codice, 1);
  });

  test("apri con il session_id di Claude Code parte subito, con il progetto dell'area; fuori area errore", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    const fuori = await esegui(["apri", "x"], opz);
    assert.deepEqual([fuori.codice, srv.richieste.length], [1, 0]);
    assert.match(fuori.stderr, /non è collegata/);
    amb.configura({ url: srv.url });
    const sid = randomUUID();
    const r = await esegui(["apri", "pdfconverter", "--descrizione", "PDF"], { ...opz, env: { ...amb.env, CLAUDE_CODE_SESSION_ID: sid } });
    assert.match(r.stdout, /Cantiere "pdfconverter" \(change pdfconverter\)/);
    const eventi = srv.eventi();
    assert.deepEqual(eventi.map((e) => [e.tipo, e.session_id, e.progetto]), [["session_start", sid, "prova"], ["apri_cantiere", sid, "prova"]]);
    assert.deepEqual(eventi[1].dati, { nome: "pdfconverter", descrizione: "PDF", origine: "utente", padre: null });
    assert.equal(existsSync(amb.cache("attesa")), false);
  });

  test("apri: il 409 del server con il motivo; comandi di v1 e sconosciuti: errore d'uso", async (t) => {
    const errore = `Il cantiere "export-pdf" è sospeso: riattivalo dalla dashboard.`;
    const { srv, amb, opz } = await preparato(t, (r) => (r.corpo?.tipo === "apri_cantiere" ? { codice: 409, corpo: { errore } } : undefined));
    amb.configura({ url: srv.url });
    const r = await esegui(["apri", "export-pdf", "--session-id", randomUUID()], opz);
    assert.notEqual(r.codice, 0);
    assert.ok(r.stderr.includes(errore), r.stderr);
    for (const v1 of ["chiudi", "setup", "boh"]) assert.equal((await esegui([v1], opz)).codice, 2, v1);
    assert.equal((await esegui(["status", "--sconosciuta"], opz)).codice, 2);
  });

  test("permetti-mcp: unisce la regola con un backup e non duplica", async (t) => {
    const { amb, opz } = await preparato(t);
    const dir = join(amb.dir, "claude");
    mkdirSync(dir);
    const prima = { permissions: { allow: ["Bash(git status)"], deny: ["Read(.env)"] }, theme: "dark" };
    writeFileSync(join(dir, "settings.json"), JSON.stringify(prima));
    assert.equal((await esegui(["permetti-mcp"], opz)).codice, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")),
      { permissions: { allow: ["Bash(git status)", "mcp__forgia"], deny: ["Read(.env)"] }, theme: "dark" });
    const backup = readdirSync(dir).filter((f) => f.startsWith("settings.json.bak-"));
    assert.equal(backup.length, 1);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, backup[0]), "utf8")), prima);
    assert.match((await esegui(["permetti-mcp"], opz)).stdout, /già/);
    assert.equal(readdirSync(dir).filter((f) => f.startsWith("settings.json.bak-")).length, 1);
  });

  test("permetti-mcp: settings.json non valido resta intatto", async (t) => {
    const { amb, opz } = await preparato(t);
    const dir = join(amb.dir, "claude");
    mkdirSync(dir);
    writeFileSync(join(dir, "settings.json"), "{ rotto");
    const r = await esegui(["permetti-mcp"], opz);
    assert.equal(r.codice, 1);
    assert.equal(readFileSync(join(dir, "settings.json"), "utf8"), "{ rotto");
  });
});

describe("prendi", () => {
  const PRESA = {
    cantiere: { ...RISPOSTA.cantiere, nome: "idoc-converter", percorso: "idoc-converter", change: "idoc-converter" },
    change: "idoc-converter",
    file: [{ nome: "nota.md", contenuto: "# nota del server" }, { nome: "appunti.txt", contenuto: "appunti" }],
  };
  // Area con openspec/, server che risponde alla presa e un `openspec` finto che crea il change.
  async function conOpenspec(t: { after: (f: () => unknown) => void }) {
    const p = await preparato(t, (r) => (r.percorso.endsWith("/prendi") ? { corpo: PRESA } : undefined));
    p.amb.configura({ url: p.srv.url });
    mkdirSync(join(p.amb.progetto, "openspec", "changes"), { recursive: true });
    const chiamateOpenspec = finto(p.amb, "openspec",
      `[ "$1" = new ] && mkdir -p "openspec/changes/$3" && printf 'schema: spec-driven\\n' > "openspec/changes/$3/.openspec.yaml"\nexit 0`);
    return { ...p, chiamateOpenspec, change: join(p.amb.progetto, "openspec", "changes", "idoc-converter") };
  }

  test("prende l'idea, crea il change con openspec e scrive i file in idee/", async (t) => {
    const { srv, amb, opz, chiamateOpenspec, change } = await conOpenspec(t);
    const sid = randomUUID();
    const r = await esegui(["prendi", "idoc-converter", "--session-id", sid], opz);
    assert.equal(r.codice, 0, r.stderr);
    assert.match(r.stdout, /change idoc-converter/);
    assert.match(r.stdout, /2 file scritti in idee\//);
    const [presa] = srv.richieste;
    assert.deepEqual([presa.metodo, presa.percorso, presa.auth], ["POST", "/api/v1/progetti/prova/cantieri/idoc-converter/prendi", `Bearer ${TOKEN}`]);
    assert.deepEqual([presa.corpo.session_id, presa.corpo.cwd, presa.corpo.repo], [sid, amb.progetto, null]);
    assert.deepEqual(chiamateOpenspec(), [`${amb.progetto}|--version`, `${amb.progetto}|new change idoc-converter`]);
    assert.equal(readFileSync(join(change, ".openspec.yaml"), "utf8"), "schema: spec-driven\n");
    assert.deepEqual(readdirSync(join(change, "idee")).sort(), ["appunti.txt", "nota.md"]);
  });

  test("file già presente non sovrascritto; change esistente non ricreato; percorso annidato codificato", async (t) => {
    const { srv, opz, chiamateOpenspec, change } = await conOpenspec(t);
    mkdirSync(join(change, "idee"), { recursive: true });
    writeFileSync(join(change, "idee", "nota.md"), "locale");
    const r = await esegui(["prendi", "idoc-converter/pre prod", "--session-id", randomUUID()], opz);
    assert.equal(r.codice, 0, r.stderr);
    assert.match(r.stdout, /già presenti, lasciati com'erano: nota\.md/);
    assert.equal(readFileSync(join(change, "idee", "nota.md"), "utf8"), "locale");
    assert.equal(srv.richieste[0].percorso, "/api/v1/progetti/prova/cantieri/idoc-converter/pre%20prod/prendi");
    assert.ok(!chiamateOpenspec().some((c) => c.includes("new change")));
  });

  test("openspec assente: nessuna chiamata al server e messaggio chiaro", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    amb.configura({ url: srv.url });
    mkdirSync(join(amb.progetto, "openspec"));
    const r = await esegui(["prendi", "idoc-converter", "--session-id", randomUUID()], { ...opz, env: { ...amb.env, PATH: join(amb.dir, "bin") } });
    assert.equal(r.codice, 1);
    assert.match(r.stderr, /serve OpenSpec/);
    assert.equal(srv.richieste.length, 0);
  });

  test("cantiere chiuso: il 409 del server arriva all'utente e non si scrive nulla", async (t) => {
    const errore = `Il cantiere "vecchio-parser" è abbandonato.`;
    const { srv, amb, opz } = await preparato(t, (r) => (r.percorso.endsWith("/prendi") ? { codice: 409, corpo: { errore } } : undefined));
    amb.configura({ url: srv.url });
    mkdirSync(join(amb.progetto, "openspec", "changes"), { recursive: true });
    finto(amb, "openspec");
    const r = await esegui(["prendi", "vecchio-parser", "--session-id", randomUUID()], opz);
    assert.equal(r.codice, 1);
    assert.ok(r.stderr.includes(errore), r.stderr);
    assert.deepEqual(readdirSync(join(amb.progetto, "openspec", "changes")), []);
  });
});

describe("dirama", () => {
  const RAMO = {
    cantiere: {
      ...RISPOSTA.cantiere, nome: "info-extra", percorso: "info-extra", stato: "idea", change: "info-extra", progetto: "mercurius",
      nato_da: [{ id: 7, progetto: "parity-deriva", percorso: "analisi", task: "3.2", tipo: "registrato" }],
    },
  };

  test("crea l'idea nell'altro progetto con session_id e task, conferma da dove nasce", async (t) => {
    const { srv, amb, opz } = await preparato(t, (r) => (r.percorso.endsWith("/rami") ? { corpo: RAMO } : undefined));
    amb.configura({ url: srv.url });
    const sid = randomUUID();
    const r = await esegui(["dirama", "mercurius/info-extra", "--task", "3.2", "--session-id", sid], opz);
    assert.equal(r.codice, 0, r.stderr);
    assert.match(r.stdout, /Idea "mercurius\/info-extra" creata, nata da "parity-deriva\/analisi" \(task 3\.2\)\./);
    const [ramo] = srv.richieste;
    assert.deepEqual([ramo.metodo, ramo.percorso, ramo.corpo], ["POST", "/api/v1/progetti/mercurius/rami", { session_id: sid, nome: "info-extra", task: "3.2" }]);
  });

  test("forma sbagliata: errore d'uso senza chiamare il server; rifiuto del server con il motivo", async (t) => {
    const errore = "Questa sessione non è in un cantiere: un ramo parte da un cantiere.";
    const { srv, amb, opz } = await preparato(t, (r) => (r.percorso.endsWith("/rami") ? { codice: 409, corpo: { errore } } : undefined));
    amb.configura({ url: srv.url });
    for (const forma of ["mercurius", "/x", "mercurius/"]) {
      const r = await esegui(["dirama", forma, "--session-id", randomUUID()], opz);
      assert.match(r.stderr, /forma: forgia dirama <progetto>\/<nome>/, forma);
    }
    assert.equal(srv.richieste.length, 0);
    const r = await esegui(["dirama", "mercurius/x", "--session-id", randomUUID()], opz);
    assert.notEqual(r.codice, 0);
    assert.ok(r.stderr.includes(errore), r.stderr);
  });
});
