import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ambiente, esegui, hook, DATI, RISPOSTA, serverFinto } from "./aiuti.ts";

// Ambiente con un finto `claude` nel PATH che registra gli argomenti ricevuti.
async function preparato(t: { after: (f: () => unknown) => void }, rispondi?: Parameters<typeof serverFinto>[0]) {
  const srv = await serverFinto(rispondi);
  const amb = ambiente();
  t.after(async () => { await srv.chiudi(); amb.pulisci(); });
  const bin = join(amb.dir, "bin");
  const log = join(amb.dir, "claude.log");
  mkdirSync(bin);
  writeFileSync(join(bin, "claude"), `#!/bin/sh\necho "$*" >> "${log}"\n`);
  chmodSync(join(bin, "claude"), 0o755);
  amb.env.PATH = `${bin}:${amb.env.PATH}`;
  const opz = { env: amb.env, cwd: amb.progetto };
  return { srv, amb, opz, chiamateClaude: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []) };
}

describe("setup", () => {
  test("verifica, salva con permessi 0600 e registra il server MCP sostituendo la registrazione", async (t) => {
    const { srv, amb, opz, chiamateClaude } = await preparato(t);
    const r = await esegui(["setup", "--url", `${srv.url}/`, "--token-stdin"], { ...opz, input: "tok-nuovo-5678\n" });
    assert.equal(r.codice, 0, r.stderr);
    assert.match(r.stdout, /configurato/);
    assert.match(r.stdout, /\/cantiere permessi/);
    assert.ok(!r.stdout.includes("tok-nuovo-5678"));
    assert.equal(statSync(amb.fileConfig).mode & 0o777, 0o600);
    const cfg = JSON.parse(readFileSync(amb.fileConfig, "utf8"));
    assert.deepEqual({ ...cfg, mcp_registrato_il: !!cfg.mcp_registrato_il }, {
      nome_server_mcp: "forgia", modalita_resoconto: null, url: srv.url, token: "tok-nuovo-5678", abilitato: true, mcp_registrato_il: true,
    });
    assert.deepEqual(chiamateClaude(), [
      "mcp remove forgia --scope user",
      `mcp add --transport http --scope user forgia ${srv.url}/mcp --header Authorization: Bearer tok-nuovo-5678`,
    ]);
    assert.equal(srv.richieste[0].auth, "Bearer tok-nuovo-5678");
  });

  test("token sbagliato: errore chiaro e niente salvato", async (t) => {
    const { srv, amb, opz } = await preparato(t, () => ({ codice: 401, corpo: {} }));
    const r = await esegui(["setup", "--url", srv.url, "--token-stdin"], { ...opz, input: "sbagliato" });
    assert.equal(r.codice, 1);
    assert.match(r.stderr, /token non valido/);
    assert.equal(existsSync(amb.fileConfig), false);
  });

  test("http verso un host remoto rifiutato", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    const r = await esegui(["setup", "--url", "http://forgia.example.org", "--token-stdin"], { ...opz, input: "x" });
    assert.match(r.stderr, /https/);
    assert.deepEqual([r.codice, srv.richieste.length, existsSync(amb.fileConfig)], [1, 0, false]);
  });

  test("versione del contratto diversa rifiutata", async (t) => {
    const { srv, amb, opz } = await preparato(t, () => ({ corpo: { ok: true, versione_contratto: 2, cliente: "x" } }));
    const r = await esegui(["setup", "--url", srv.url, "--token-stdin"], { ...opz, input: "x" });
    assert.match(r.stderr, /versione 2 del contratto, serve la 1/);
    assert.deepEqual([r.codice, existsSync(amb.fileConfig)], [1, false]);
  });

  test("FORGIA_TOKEN basta; senza claude nel PATH stampa la config a mano senza il token", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    const env = { ...amb.env, PATH: amb.dir, FORGIA_TOKEN: "tok-ambiente-4321" };
    const r = await esegui(["setup", "--url", srv.url], { ...opz, env });
    assert.equal(r.codice, 0, r.stderr);
    assert.match(r.stdout, /"Authorization": "Bearer <token>"/);
    assert.ok(!r.stdout.includes("tok-ambiente-4321"));
    const cfg = JSON.parse(readFileSync(amb.fileConfig, "utf8"));
    assert.deepEqual([cfg.token, cfg.mcp_registrato_il], ["tok-ambiente-4321", null]);
  });
});

test("token mancante senza terminale: indica FORGIA_TOKEN e il setup da terminale, non salva", async (t) => {
  const { srv, amb, opz } = await preparato(t);
  const r = await esegui(["setup", "--url", srv.url], opz);
  assert.notEqual(r.codice, 0);
  assert.match(r.stderr, /FORGIA_TOKEN/);
  assert.match(r.stderr, /\/bin\/forgia setup --url /);
  assert.ok(!existsSync(amb.fileConfig));
});

describe("status, on/off, apri/chiudi, permetti-mcp", () => {
  test("status --json: token mascherato, server raggiungibile, ultima sessione della cartella", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    assert.equal(JSON.parse((await esegui(["status", "--json"], opz)).stdout).configurato, false);
    assert.match((await esegui(["status"], opz)).stdout, /lancia \/cantiere server <url> \[nome\]/);
    amb.configura({ url: srv.url });
    const sid = randomUUID();
    await hook("session_start", { ...DATI.session_start, session_id: sid, cwd: amb.progetto }, opz);
    const s = JSON.parse((await esegui(["status", "--json"], opz)).stdout);
    assert.deepEqual([s.configurato, s.abilitato, s.token, s.server, s.ultima_sessione.session_id, s.ultima_sessione.cantiere],
      [true, true, "…1234", { raggiungibile: true, cliente: "prova" }, sid, "app@main"]);
    assert.match((await esegui(["status"], opz)).stdout, /tracciamento acceso/);
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
  });

  test("apri e chiudi con il session_id di Claude Code partono subito", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    amb.configura({ url: srv.url });
    const sid = randomUUID();
    const r = await esegui(["apri", "oauth-logiquo", "--descrizione", "login"], { ...opz, env: { ...amb.env, CLAUDE_CODE_SESSION_ID: sid } });
    assert.match(r.stdout, /Cantiere "app@main"/);
    await esegui(["chiudi", "--esito", "abbandonato", "--nota", "non serve", "--session-id", sid], opz);
    const eventi = srv.eventi();
    assert.deepEqual(eventi.map((e) => [e.tipo, e.session_id]), [["session_start", sid], ["apri_cantiere", sid], ["chiudi_cantiere", sid]]);
    assert.deepEqual(eventi[1].dati, { nome: "oauth-logiquo", descrizione: "login", origine: "utente", padre: null });
    assert.deepEqual(eventi[2].dati, { esito: "abbandonato", nota: "non serve", forza: false });
    assert.equal(existsSync(amb.cache("attesa")), false);
  });

  test("apri --padre e chiudi -f; il percorso della risposta in apri e in status; il 409 con il motivo", async (t) => {
    const figlio = { ...RISPOSTA, cantiere: { ...RISPOSTA.cantiere, nome: "oauth", percorso: "logiquo-v2/oauth" } };
    const errore = `Il cantiere "logiquo-v2" ha figli aperti: oauth. Chiudili prima, o usa forza.`;
    const { srv, amb, opz } = await preparato(t, (r) =>
      r.corpo?.tipo === "apri_cantiere" ? { corpo: figlio }
        : r.corpo?.tipo === "chiudi_cantiere" && !r.corpo.dati.forza ? { codice: 409, corpo: { errore } } : undefined);
    amb.configura({ url: srv.url });
    const conSid = { ...opz, env: { ...amb.env, CLAUDE_CODE_SESSION_ID: randomUUID() } };
    assert.match((await esegui(["apri", "oauth", "--padre", "logiquo-v2"], conSid)).stdout, /Cantiere "logiquo-v2\/oauth"/);
    assert.equal(JSON.parse((await esegui(["status", "--json"], conSid)).stdout).ultima_sessione.cantiere, "logiquo-v2/oauth");
    const rifiuto = await esegui(["chiudi"], conSid);
    assert.notEqual(rifiuto.codice, 0);
    assert.ok(rifiuto.stderr.includes(errore), rifiuto.stderr);
    assert.equal((await esegui(["chiudi", "-f"], conSid)).codice, 0);
    const [, apertura, chiusura, forzata] = srv.eventi();
    assert.equal(apertura.dati.padre, "logiquo-v2");
    assert.deepEqual([chiusura.dati.forza, forzata.dati.forza], [false, true]);
  });

  test("chiudi con esito non valido e comandi sconosciuti: errore d'uso", async (t) => {
    const { srv, amb, opz } = await preparato(t);
    amb.configura({ url: srv.url });
    const r = await esegui(["chiudi", "--esito", "finito", "--session-id", "x"], opz);
    assert.deepEqual([r.codice, srv.richieste.length], [1, 0]);
    assert.match(r.stderr, /esito non valido/);
    assert.equal((await esegui(["boh"], opz)).codice, 2);
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
