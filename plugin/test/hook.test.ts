import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { DATI, TRANSCRIPT, WRAPPER, ambiente, esegui, fileSotto, hook, portaChiusa, RISPOSTA, serverFinto } from "./aiuti.ts";

// Ambiente configurato con FORGIA_URL/FORGIA_TOKEN e una sessione nuova.
async function preparato(t: { after: (f: () => unknown) => void }, rispondi?: Parameters<typeof serverFinto>[0]) {
  const srv = await serverFinto(rispondi);
  const amb = ambiente({ FORGIA_URL: srv.url, FORGIA_TOKEN: "tok-prova-9876" });
  t.after(async () => { await srv.chiudi(); amb.pulisci(); });
  const sid = randomUUID();
  const input = (nome: string, extra: object = {}) => ({ ...DATI[nome], session_id: sid, cwd: amb.progetto, ...extra });
  return { srv, amb, sid, input, opz: { env: amb.env, cwd: amb.progetto } };
}

const tipi = (eventi: any[]) => eventi.map((e) => e.tipo);
const contesto = (stdout: string) => JSON.parse(stdout).hookSpecificOutput.additionalContext;

describe("fail-open ed esclusioni", () => {
  test("stdin non JSON: exit 0, niente output", async (t) => {
    const { opz } = await preparato(t);
    const r = await esegui(["hook", "stop"], { ...opz, input: "non è json" });
    assert.deepEqual([r.codice, r.stdout, r.stderr], [0, "", ""]);
  });

  test("non configurato: avviso una volta al giorno e nessun contesto", async (t) => {
    const amb = ambiente();
    t.after(amb.pulisci);
    const input = { ...DATI.session_start, session_id: randomUUID(), cwd: amb.progetto };
    const primo = await hook("session_start", input, { env: amb.env });
    assert.deepEqual(JSON.parse(primo.stdout), { systemMessage: "cantiere forgia non configurato: lancia /cantiere" });
    assert.equal((await hook("session_start", input, { env: amb.env })).stdout, "");
  });

  test(".forgia-off nella radice git vale anche nelle sottocartelle", async (t) => {
    const { srv, amb, input } = await preparato(t);
    execFileSync("git", ["init", "-q", amb.progetto]);
    writeFileSync(join(amb.progetto, ".forgia-off"), "");
    const sotto = join(amb.progetto, "src");
    mkdirSync(sotto);
    const r = await hook("session_start", input("session_start", { cwd: sotto }), { env: amb.env, cwd: sotto });
    assert.deepEqual([r.codice, r.stdout, srv.richieste.length], [0, "", 0]);
  });

  test("FORGIA_DISABLED=1 e tracciamento spento non mandano nulla", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    await hook("prompt_invio", input("prompt", { prompt: "ciao" }), { ...opz, env: { ...amb.env, FORGIA_DISABLED: "1" } });
    amb.configura({ url: srv.url, abilitato: false });
    const { FORGIA_URL, FORGIA_TOKEN, ...senzaOverride } = amb.env;
    await hook("prompt_invio", input("prompt", { prompt: "ciao" }), { ...opz, env: senzaOverride });
    assert.equal(srv.richieste.length, 0);
  });

  test("wrapper senza node nel PATH: hook muto, comandi con messaggio ed exit 127", async (t) => {
    const amb = ambiente();
    t.after(amb.pulisci);
    const env = { PATH: amb.dir };
    const h = await esegui([WRAPPER, "hook", "prompt"], { env, input: "{}" });
    assert.deepEqual([h.codice, h.stdout, h.stderr], [0, "", ""]);
    const s = await esegui([WRAPPER, "status"], { env });
    assert.equal(s.codice, 127);
    assert.match(s.stderr, /richiede Node\.js ≥ 22\.18/);
  });
});

describe("session_start", () => {
  test("inietta il contesto del server e salva l'avvio reale", async (t) => {
    const { srv, amb, sid, input, opz } = await preparato(t, () => ({ corpo: { ...RISPOSTA, contesto: `[forgia] session_id=x` } }));
    const r = await hook("session_start", input("session_start"), opz);
    assert.equal(contesto(r.stdout), "[forgia] session_id=x");
    const [ev] = srv.eventi();
    assert.deepEqual([ev.tipo, ev.dati, ev.session_id, ev.cwd, ev.repo, ev.branch], ["session_start", { source: "startup" }, sid, amb.progetto, null, null]);
    assert.match(ev.evento_id, /^[0-9a-f-]{36}$/);
    assert.ok(JSON.parse(readFileSync(amb.cache("sessioni", `${sid}.json`), "utf8")).avvio_reale_il);
  });

  test("source fuori contratto (fork) va come resume", async (t) => {
    const { srv, input, opz } = await preparato(t);
    await hook("session_start", input("session_start", { source: "fork" }), opz);
    assert.deepEqual(srv.eventi()[0].dati, { source: "resume" });
  });

  test("repo e branch da git, senza credenziali", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    execFileSync("git", ["init", "-q", "-b", "feat-x", amb.progetto]);
    execFileSync("git", ["-C", amb.progetto, "remote", "add", "origin", "https://user:ghp_segreto@github.com/org/app.git"]);
    await hook("session_start", input("session_start"), opz);
    const [ev] = srv.eventi();
    assert.deepEqual([ev.repo, ev.branch], ["github.com/org/app", "feat-x"]);
  });
});

describe("coda locale", () => {
  test("server giù: riga minima, exit 0 sotto 2 s; al ritorno la coda parte con id e ts originali", async (t) => {
    const { srv, amb, sid, input, opz } = await preparato(t);
    const giu = { ...opz, env: { ...amb.env, FORGIA_URL: await portaChiusa() } };
    const r = await hook("session_start", input("session_start"), giu);
    assert.equal(r.codice, 0);
    assert.ok(r.ms < 2000, `${r.ms} ms`);
    assert.equal(contesto(r.stdout), `[forgia] session_id=${sid} (server non raggiungibile)`);
    await hook("prompt_invio", input("prompt", { prompt: "lavora" }), giu);
    await hook("stop", input("stop", { transcript_path: join(amb.dir, "manca.jsonl") }), giu);
    const inCoda = readdirSync(amb.cache("coda")).sort().map((f) => JSON.parse(readFileSync(amb.cache("coda", f), "utf8")));
    assert.deepEqual(tipi(inCoda), ["session_start", "prompt", "stop"]);

    await hook("session_end", input("session_end"), opz);
    const arrivati = srv.eventi();
    assert.deepEqual(tipi(arrivati), ["session_end", "session_start", "prompt", "stop"]);
    assert.deepEqual(arrivati.slice(1), inCoda);
    assert.deepEqual(readdirSync(amb.cache("coda")), []);
  });

  test("al massimo 500 eventi: si scartano i più vecchi", async (t) => {
    const { amb, input, opz } = await preparato(t);
    mkdirSync(amb.cache("coda"), { recursive: true });
    for (let i = 0; i < 500; i++) writeFileSync(amb.cache("coda", `${String(i).padStart(15, "0")}-vecchio.json`), "{}");
    await hook("prompt_invio", input("prompt", { prompt: "x" }), { ...opz, env: { ...amb.env, FORGIA_URL: await portaChiusa() } });
    const coda = readdirSync(amb.cache("coda")).sort();
    assert.equal(coda.length, 500);
    assert.ok(!coda.includes(`${"0".repeat(15)}-vecchio.json`));
  });

  test("422 toglie l'evento dalla coda, 401 lo lascia", async (t) => {
    let codice = 422;
    const { amb, input, opz } = await preparato(t, () => ({ codice, corpo: { errore: "x" } }));
    await hook("session_start", input("session_start"), opz);
    assert.deepEqual(readdirSync(amb.cache("coda")), []);
    codice = 401;
    await hook("session_end", input("session_end"), opz);
    assert.equal(readdirSync(amb.cache("coda")).length, 1);
  });
});

describe("sessione tardiva, operazioni in attesa, pulizia, debug", () => {
  test("sessione mai vista: session_start tardivo prima dello stop", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    await hook("stop", input("stop", { transcript_path: join(amb.dir, "manca.jsonl") }), opz);
    assert.deepEqual(tipi(srv.eventi()), ["session_start", "stop"]);
    assert.deepEqual(srv.eventi()[0].dati, { source: "tardivo" });
  });

  test("operazione in attesa: la manda il primo hook della stessa cartella; scaduta si scarta", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    const apri = await esegui(["apri", "prova-attesa"], opz);
    assert.match(apri.stdout, /In attesa/);
    await hook("stop", input("stop", { transcript_path: join(amb.dir, "manca.jsonl") }), opz);
    assert.deepEqual(tipi(srv.eventi()), ["session_start", "apri_cantiere", "stop"]);
    assert.deepEqual(srv.eventi()[1].dati, { nome: "prova-attesa", descrizione: null, origine: "utente", padre: null });

    await esegui(["chiudi", "--esito", "sospeso"], opz);
    const [file] = readdirSync(amb.cache("attesa"));
    const op = JSON.parse(readFileSync(amb.cache("attesa", file), "utf8"));
    writeFileSync(amb.cache("attesa", file), JSON.stringify({ ...op, creato_il: new Date(Date.now() - 11 * 60_000).toISOString() }));
    await hook("session_end", input("session_end"), opz);
    assert.ok(!tipi(srv.eventi()).includes("chiudi_cantiere"));
    assert.deepEqual(readdirSync(amb.cache("attesa")), []);
  });

  test("file di sessione di 14 giorni fa eliminato", async (t) => {
    const { amb, input, opz } = await preparato(t);
    mkdirSync(amb.cache("sessioni"), { recursive: true });
    const vecchia = amb.cache("sessioni", "vecchia.json");
    writeFileSync(vecchia, "{}");
    const prima = (Date.now() - 14 * 24 * 3600_000) / 1000;
    utimesSync(vecchia, prima, prima);
    await hook("session_start", input("session_start"), opz);
    assert.equal(existsSync(vecchia), false);
  });

  test("debug: input con prompt oscurato; senza FORGIA_DEBUG nessun log", async (t) => {
    const { amb, input, opz } = await preparato(t);
    await hook("prompt_invio", input("prompt", { prompt: "testo riservato" }), opz);
    assert.equal(existsSync(amb.cache("debug.log")), false);
    await hook("stop", input("stop", { transcript_path: join(amb.dir, "manca.jsonl") }), { ...opz, env: { ...amb.env, FORGIA_DEBUG: "1" } });
    await hook("prompt_invio", input("prompt", { prompt: "testo riservato" }), { ...opz, env: { ...amb.env, FORGIA_DEBUG: "1" } });
    const log = readFileSync(amb.cache("debug.log"), "utf8");
    assert.match(log, /"prompt":"<oscurato>"/);
    assert.match(log, /"last_assistant_message":"<oscurato>"/);
    assert.ok(!log.includes("testo riservato"));
  });
});

describe("prompt e /cantiere", () => {
  test("/cantiere nome — descrizione: apri_cantiere sincrono con conferma, niente evento prompt", async (t) => {
    const conferma = `[forgia] Comando /cantiere gestito: cantiere "oauth-logiquo" aperto (id 12). Rispondi all'utente con una sola riga di conferma.`;
    const { srv, input, opz } = await preparato(t, (r) => (r.corpo?.tipo === "apri_cantiere" ? { corpo: { ...RISPOSTA, contesto: conferma } } : undefined));
    await hook("session_start", input("session_start"), opz);
    const p = input("prompt", { prompt: "/cantiere oauth-logiquo — login con Logiquo" });
    const r = await hook("prompt", p, opz);
    await hook("prompt_invio", p, opz);
    assert.equal(contesto(r.stdout), conferma);
    assert.deepEqual(tipi(srv.eventi()), ["session_start", "apri_cantiere"]);
    assert.deepEqual(srv.eventi()[1].dati, { nome: "oauth-logiquo", descrizione: "login con Logiquo", origine: "utente", padre: null });
  });

  test("/forgia:cantiere chiudi sospeso, /cantieri, /cantiere-x e /cantiere chiudi finito", async (t) => {
    const { srv, input, opz } = await preparato(t);
    await hook("session_start", input("session_start"), opz);
    for (const prompt of ["/forgia:cantiere chiudi sospeso", "/cantieri", "/cantiere-x", "/cantiere chiudi finito", "/cantiere stato"]) {
      await hook("prompt", input("prompt", { prompt }), opz);
    }
    assert.deepEqual(tipi(srv.eventi()), ["session_start", "chiudi_cantiere"]);
    assert.deepEqual(srv.eventi()[1].dati, { esito: "sospeso", nota: null, forza: false });
  });

  test("/cantiere con --padre e chiudi -f: padre e forza nell'evento", async (t) => {
    const { srv, input, opz } = await preparato(t);
    await hook("session_start", input("session_start"), opz);
    await hook("prompt", input("prompt", { prompt: "/cantiere oauth --padre logiquo-v2 — login" }), opz);
    await hook("prompt", input("prompt", { prompt: "/cantiere chiudi -f sospeso" }), opz);
    assert.deepEqual(srv.eventi().slice(1).map((e) => e.dati), [
      { nome: "oauth", descrizione: "login", origine: "utente", padre: "logiquo-v2" },
      { esito: "sospeso", nota: null, forza: true },
    ]);
  });

  test("409 a un /cantiere: il motivo del server arriva a Claude, e l'evento esce dalla coda", async (t) => {
    const errore = `Il cantiere "logiquo-v2" ha figli aperti: oauth. Chiudili prima, o usa forza.`;
    const { amb, input, opz } = await preparato(t, (r) => (r.corpo?.tipo === "chiudi_cantiere" ? { codice: 409, corpo: { errore } } : undefined));
    await hook("session_start", input("session_start"), opz);
    const r = await hook("prompt", input("prompt", { prompt: "/cantiere chiudi" }), opz);
    assert.equal(contesto(r.stdout), `[forgia] Comando /cantiere gestito: ${errore} Rispondi all'utente con una sola riga.`);
    assert.deepEqual(readdirSync(amb.cache("coda")), []);
  });

  test("il contesto restituito per un prompt si inietta una volta, al prompt dopo", async (t) => {
    const { input, opz } = await preparato(t, (r) => (r.corpo?.tipo === "prompt" ? { corpo: { ...RISPOSTA, contesto: "[forgia] Cantiere provvisorio: app@main." } } : undefined));
    await hook("session_start", input("session_start"), opz);
    await hook("prompt_invio", input("prompt", { prompt: "primo" }), opz);
    const secondo = await hook("prompt", input("prompt", { prompt: "secondo" }), opz);
    assert.equal(contesto(secondo.stdout), "[forgia] Cantiere provvisorio: app@main.");
    assert.equal((await hook("prompt", input("prompt", { prompt: "terzo" }), opz)).stdout, "");
  });

  test("privacy: il testo del prompt non arriva al server e non resta in nessun file", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    const debug = { ...opz, env: { ...amb.env, FORGIA_DEBUG: "1" } };
    const p = input("prompt", { prompt: "la password è S3gr3t0-XYZ" });
    await hook("prompt", p, debug);
    await hook("prompt_invio", p, debug);
    assert.deepEqual(srv.eventi().at(-1).dati, {});
    assert.ok(!JSON.stringify(srv.richieste).includes("S3gr3t0"));
    assert.deepEqual(fileSotto(amb.dir).filter((f) => f.testo.includes("S3gr3t0")), []);
  });
});

describe("todo, stop, session_end", () => {
  test("todo dai payload registrati", async (t) => {
    const { srv, input, opz } = await preparato(t);
    for (const nome of ["todowrite", "taskcreate", "taskupdate_completed"]) await hook("todo", input(nome), opz);
    await hook("todo", input("taskcreate", { tool_response: {} }), opz);
    const todo = srv.eventi().filter((e) => e.tipo === "todo").map((e) => e.dati);
    assert.deepEqual(todo, [
      { strumento: "TodoWrite", completo: true, todos: [{ id: null, testo: "alfa", stato: "in_progress" }, { id: null, testo: "beta", stato: "pending" }] },
      { strumento: "TaskCreate", completo: false, todos: [{ id: "1", testo: "alfa", stato: "pending" }] },
      { strumento: "TaskUpdate", completo: false, todos: [{ id: "1", testo: "alfa", stato: "completed" }] },
    ]);
  });

  test("stop: blocca il turno con 3 strumenti senza resoconto, poi non blocca due volte", async (t) => {
    const { srv, amb, sid, input, opz } = await preparato(t);
    const { FORGIA_URL, FORGIA_TOKEN, ...env } = amb.env;
    amb.configura({ url: srv.url, mcp_registrato_il: new Date(Date.now() - 3600_000).toISOString() });
    const o = { ...opz, env };
    await hook("session_start", input("session_start"), o);
    const transcript = join(amb.dir, "t.jsonl");
    writeFileSync(transcript, TRANSCRIPT + JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Grep" }] } }) + "\n");
    const r = await hook("stop", input("stop", { transcript_path: transcript }), o);
    assert.deepEqual(JSON.parse(r.stdout), {
      decision: "block",
      reason: `[forgia] Prima di chiudere chiama aggiorna_stato (session_id=${sid}): fatto, prossimo, bloccato_da in frasi brevi. Poi termina senza ripetere la risposta.`,
    });
    const di = await hook("stop", input("stop", { transcript_path: transcript, stop_hook_active: true }), o);
    assert.equal(di.stdout, "");
    const stop = srv.eventi().filter((e) => e.tipo === "stop").map((e) => e.dati);
    assert.deepEqual(stop, [
      { strumenti_nel_turno: 3, resoconto_inviato: false, bloccato: true },
      { strumenti_nel_turno: 3, resoconto_inviato: false, bloccato: false },
    ]);
  });

  test("stop: MCP registrato dopo l'avvio o modalità leggera locale non bloccano", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    const { FORGIA_URL, FORGIA_TOKEN, ...env } = amb.env;
    const o = { ...opz, env };
    amb.configura({ url: srv.url, mcp_registrato_il: new Date(Date.now() - 3600_000).toISOString() });
    await hook("session_start", input("session_start"), o);
    amb.configura({ url: srv.url, mcp_registrato_il: new Date(Date.now() + 3600_000).toISOString() });
    const transcript = join(amb.dir, "t.jsonl");
    writeFileSync(transcript, TRANSCRIPT + JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Grep" }] } }) + "\n");
    assert.equal((await hook("stop", input("stop", { transcript_path: transcript }), o)).stdout, "");
    amb.configura({ url: srv.url, mcp_registrato_il: "2000-01-01T00:00:00.000Z", modalita_resoconto: "leggero" });
    assert.equal((await hook("stop", input("stop", { transcript_path: transcript }), o)).stdout, "");
  });

  test("session_end con reason", async (t) => {
    const { srv, input, opz } = await preparato(t);
    await hook("session_start", input("session_start"), opz);
    await hook("session_end", input("session_end", { reason: "prompt_input_exit" }), opz);
    assert.deepEqual(srv.eventi().at(-1).dati, { reason: "prompt_input_exit" });
  });

  test("latenza degli hook sincroni dal wrapper", async (t) => {
    const { input, opz } = await preparato(t);
    const misura = async (nome: string, inp: object) => {
      const tempi = [];
      for (let i = 0; i < 5; i++) tempi.push((await esegui([WRAPPER, "hook", nome], { ...opz, input: JSON.stringify(inp) })).ms);
      return Math.round(tempi.sort((a, b) => a - b)[2]);
    };
    const avvio = await misura("session_start", input("session_start"));
    const prompt = await misura("prompt", input("prompt", { prompt: "ciao" }));
    t.diagnostic(`mediana: session_start ${avvio} ms, prompt ${prompt} ms`);
    assert.ok(prompt < 1000 && avvio < 1000, `${avvio} / ${prompt} ms`); // larga: la misura vera è nel diagnostic
  });
});
