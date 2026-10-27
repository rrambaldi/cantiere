import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { DATI, TOKEN, TRANSCRIPT, WRAPPER, ambiente, esegui, fileSotto, hook, portaChiusa, RISPOSTA, serverFinto } from "./aiuti.ts";

const TITOLI = fileURLToPath(new URL("./dati/titoli.jsonl", import.meta.url));

// Ambiente con un'area sulla cartella del progetto e una sessione nuova.
async function preparato(t: { after: (f: () => unknown) => void }, rispondi?: Parameters<typeof serverFinto>[0]) {
  const srv = await serverFinto(rispondi);
  const amb = ambiente();
  amb.configura({ url: srv.url });
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

  test("nessuna area: avviso una volta al giorno e nessun contesto", async (t) => {
    const amb = ambiente();
    t.after(amb.pulisci);
    const input = { ...DATI.session_start, session_id: randomUUID(), cwd: amb.progetto };
    const primo = await hook("session_start", input, { env: amb.env });
    assert.deepEqual(JSON.parse(primo.stdout), { systemMessage: "cantiere forgia: nessuna cartella collegata, lancia /cantiere collega <progetto>" });
    assert.equal((await hook("session_start", input, { env: amb.env })).stdout, "");
  });

  test("config v1 (url e token senza aree): vale come nessuna area", async (t) => {
    const srv = await serverFinto();
    const amb = ambiente();
    t.after(async () => { await srv.chiudi(); amb.pulisci(); });
    mkdirSync(join(amb.dir, "config", "forgia"), { recursive: true });
    writeFileSync(amb.fileConfig, JSON.stringify({ url: srv.url, token: TOKEN, abilitato: true }));
    const r = await hook("session_start", { ...DATI.session_start, session_id: randomUUID(), cwd: amb.progetto }, { env: amb.env });
    assert.match(r.stdout, /nessuna cartella collegata/);
    assert.equal(srv.richieste.length, 0);
  });

  test("fuori da ogni area: nessun evento e nessun contesto, nemmeno l'avviso", async (t) => {
    const { srv, amb, input } = await preparato(t);
    const fuori = join(amb.dir, "altrove");
    mkdirSync(fuori);
    for (const nome of ["session_start", "prompt", "prompt_invio", "stop", "copia"]) {
      const r = await hook(nome, input(nome === "prompt_invio" ? "prompt" : nome, { cwd: fuori }), { env: amb.env, cwd: fuori });
      assert.deepEqual([r.codice, r.stdout], [0, ""], nome);
    }
    assert.equal(srv.richieste.length, 0);
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
    await hook("prompt_invio", input("prompt", { prompt: "ciao" }), opz);
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

describe("aree", () => {
  test("aree annidate: vale la più specifica, con il suo token e il suo progetto", async (t) => {
    const { srv, amb, input } = await preparato(t);
    const poker = join(amb.progetto, "poker");
    const web = join(poker, "web");
    mkdirSync(web, { recursive: true });
    amb.configura({ aree: [
      { cartella: amb.progetto, url: srv.url, token: "tok-priv-1111", committente: "PRIV", progetto: "cantiere", mcp_registrato_il: null },
      { cartella: poker, url: srv.url, token: "tok-cvstudio-2222", committente: "CVSTUDIO", progetto: "poker", mcp_registrato_il: null },
    ] });
    await hook("session_start", input("session_start", { cwd: web }), { env: amb.env, cwd: web });
    const [r] = srv.richieste;
    assert.deepEqual([r.auth, r.corpo.progetto, r.corpo.cwd], ["Bearer tok-cvstudio-2222", "poker", web]);
  });

  test("cartella con un nome che ne prolunga un'altra: confronto per segmenti", async (t) => {
    const { srv, amb, input } = await preparato(t);
    const pok = `${amb.progetto}-bis`;
    mkdirSync(pok);
    await hook("session_start", input("session_start", { cwd: pok }), { env: amb.env, cwd: pok });
    assert.equal(srv.richieste.length, 0);
  });

  test("FORGIA_TOKEN negli hook non vale: parte il token dell'area", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    await hook("session_start", input("session_start"), { ...opz, env: { ...amb.env, FORGIA_TOKEN: "tok-di-un-altro", FORGIA_URL: "http://127.0.0.1:9" } });
    assert.deepEqual(srv.richieste.map((r) => r.auth), [`Bearer ${TOKEN}`]);
  });
});

describe("session_start", () => {
  test("inietta il contesto del server e salva l'avvio reale", async (t) => {
    const { srv, amb, sid, input, opz } = await preparato(t, () => ({ corpo: { ...RISPOSTA, contesto: `[forgia] session_id=x` } }));
    const r = await hook("session_start", input("session_start"), opz);
    assert.equal(contesto(r.stdout), "[forgia] session_id=x");
    const [ev] = srv.eventi();
    assert.deepEqual([ev.tipo, ev.dati, ev.session_id, ev.cwd, ev.repo, ev.branch, ev.progetto],
      ["session_start", { source: "startup" }, sid, amb.progetto, null, null, "prova"]);
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
  test("server giù: riga minima, exit 0 sotto 2 s; al ritorno la coda parte con id, ts e progetto originali", async (t) => {
    const { srv, amb, sid, input, opz } = await preparato(t);
    amb.configura({ url: await portaChiusa() });
    const r = await hook("session_start", input("session_start"), opz);
    assert.equal(r.codice, 0);
    assert.ok(r.ms < 2000, `${r.ms} ms`);
    assert.equal(contesto(r.stdout), `[forgia] session_id=${sid} (server non raggiungibile)`);
    await hook("prompt_invio", input("prompt", { prompt: "lavora" }), opz);
    await hook("stop", input("stop", { transcript_path: join(amb.dir, "manca.jsonl") }), opz);
    const inCoda = readdirSync(amb.cache("coda")).sort().map((f) => JSON.parse(readFileSync(amb.cache("coda", f), "utf8")));
    assert.deepEqual(tipi(inCoda.map((v) => v.evento)), ["session_start", "prompt", "stop"]);
    assert.ok(inCoda.every((v) => v.cartella === amb.progetto && !JSON.stringify(v).includes(TOKEN)), "in coda la cartella, mai il token");

    amb.configura({ url: srv.url });
    await hook("session_end", input("session_end"), opz);
    const arrivati = srv.eventi();
    assert.deepEqual(tipi(arrivati), ["session_end", "session_start", "prompt", "stop"]);
    assert.deepEqual(arrivati.slice(1), inCoda.map((v) => v.evento));
    assert.deepEqual(readdirSync(amb.cache("coda")), []);
  });

  test("eventi di due aree: ognuno parte con il token della sua area; quelli di un'area cancellata si scartano", async (t) => {
    const { srv, amb, input } = await preparato(t);
    const poker = join(amb.dir, "poker");
    const mercurius = join(amb.dir, "mercurius");
    const vecchia = join(amb.dir, "vecchia");
    for (const d of [poker, mercurius, vecchia]) mkdirSync(d);
    const area = (cartella: string, url: string, token: string, committente: string, progetto: string) =>
      ({ cartella, url, token, committente, progetto, mcp_registrato_il: null });
    const chiusa = await portaChiusa();
    amb.configura({ aree: [area(poker, chiusa, "tok-cvstudio", "CVSTUDIO", "poker"), area(mercurius, chiusa, "tok-priv", "PRIV", "mercurius"),
      area(vecchia, chiusa, "tok-vecchio", "DGT", "monitor")] });
    for (const cwd of [poker, mercurius, vecchia]) await hook("prompt_invio", input("prompt", { prompt: "x", cwd }), { env: amb.env, cwd });
    assert.ok(!fileSotto(amb.cache("coda")).some((f) => f.testo.includes("tok-")), "nessun token in coda");
    amb.configura({ aree: [area(poker, srv.url, "tok-cvstudio", "CVSTUDIO", "poker"), area(mercurius, srv.url, "tok-priv", "PRIV", "mercurius")] });
    await hook("session_end", input("session_end", { cwd: poker }), { env: amb.env, cwd: poker });
    const prompt = srv.richieste.filter((r) => r.corpo?.tipo === "prompt").map((r) => [r.auth, r.corpo.progetto]);
    assert.deepEqual(prompt, [["Bearer tok-cvstudio", "poker"], ["Bearer tok-priv", "mercurius"]]);
    assert.deepEqual(readdirSync(amb.cache("coda")), []);
  });

  test("al massimo 500 eventi: si scartano i più vecchi", async (t) => {
    const { amb, input, opz } = await preparato(t);
    amb.configura({ url: await portaChiusa() });
    mkdirSync(amb.cache("coda"), { recursive: true });
    for (let i = 0; i < 500; i++) writeFileSync(amb.cache("coda", `${String(i).padStart(15, "0")}-vecchio.json`), "{}");
    await hook("prompt_invio", input("prompt", { prompt: "x" }), opz);
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

    await esegui(["apri", "scade"], opz);
    const [file] = readdirSync(amb.cache("attesa"));
    const op = JSON.parse(readFileSync(amb.cache("attesa", file), "utf8"));
    writeFileSync(amb.cache("attesa", file), JSON.stringify({ ...op, creato_il: new Date(Date.now() - 11 * 60_000).toISOString() }));
    await hook("session_end", input("session_end"), opz);
    assert.equal(srv.eventi().filter((e) => e.tipo === "apri_cantiere").length, 1);
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
  test("/cantiere nome — descrizione: apri_cantiere sincrono con progetto e conferma, niente evento prompt", async (t) => {
    const conferma = `[forgia] Comando /cantiere gestito: cantiere "pdfconverter" aperto (change pdfconverter). Rispondi all'utente con una sola riga di conferma.`;
    const { srv, sid, input, opz } = await preparato(t, (r) => (r.corpo?.tipo === "apri_cantiere" ? { corpo: { ...RISPOSTA, contesto: conferma } } : undefined));
    await hook("session_start", input("session_start"), opz);
    const p = input("prompt", { prompt: "/cantiere pdfconverter — conversione dei PDF caricati" });
    const r = await hook("prompt", p, opz);
    await hook("prompt_invio", p, opz);
    assert.equal(contesto(r.stdout), conferma);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.sessionTitle, `prova · ${sid.slice(0, 8)} · pdfconverter`);
    assert.deepEqual(tipi(srv.eventi()), ["session_start", "apri_cantiere"]);
    assert.deepEqual(srv.eventi()[1].dati, { nome: "pdfconverter", descrizione: "conversione dei PDF caricati", origine: "utente", padre: null });
    assert.equal(srv.eventi()[1].progetto, "prova");
  });

  test("prefisso del plugin e percorso; parole riservate e comandi simili non mandano nulla", async (t) => {
    const { srv, input, opz } = await preparato(t);
    await hook("session_start", input("session_start"), opz);
    for (const prompt of ["/forgia:cantiere idoc-converter/preprod", "/cantieri", "/cantiere-x", "/cantiere chiudi -f sospeso", "/cantiere chiudi finito",
      "/cantiere stato", "/cantiere prendi idoc-converter", "/cantiere collega poker https://x.example", "/cantiere server https://x.example", "/cantiere comandi on"]) {
      await hook("prompt", input("prompt", { prompt }), opz);
    }
    assert.deepEqual(tipi(srv.eventi()), ["session_start", "apri_cantiere"]);
    assert.equal(srv.eventi()[1].dati.nome, "idoc-converter/preprod");
  });

  test("/cantiere con --padre: padre nell'evento", async (t) => {
    const { srv, input, opz } = await preparato(t);
    await hook("session_start", input("session_start"), opz);
    await hook("prompt", input("prompt", { prompt: "/cantiere preprod --padre idoc-converter — verso il server di prova" }), opz);
    assert.deepEqual(srv.eventi()[1].dati, { nome: "preprod", descrizione: "verso il server di prova", origine: "utente", padre: "idoc-converter" });
  });

  test("409 a un /cantiere: il motivo del server arriva a Claude, e l'evento esce dalla coda", async (t) => {
    const errore = `Il cantiere "export-pdf" è sospeso: riattivalo dalla dashboard.`;
    const { amb, input, opz } = await preparato(t, (r) => (r.corpo?.tipo === "apri_cantiere" ? { codice: 409, corpo: { errore } } : undefined));
    await hook("session_start", input("session_start"), opz);
    const r = await hook("prompt", input("prompt", { prompt: "/cantiere export-pdf" }), opz);
    assert.equal(contesto(r.stdout), `[forgia] Comando /cantiere gestito: ${errore} Rispondi all'utente con una sola riga.`);
    assert.deepEqual(readdirSync(amb.cache("coda")), []);
  });

  test("il contesto restituito per un prompt si inietta una volta, al prompt dopo", async (t) => {
    const avviso = "[forgia] Il cantiere export-pdf è sospeso: ora lavori direttamente su prova. Dillo all'utente in una riga.";
    const { input, opz } = await preparato(t, (r) => (r.corpo?.tipo === "prompt" ? { corpo: { ...RISPOSTA, cantiere: null, contesto: avviso } } : undefined));
    await hook("session_start", input("session_start"), opz);
    await hook("prompt_invio", input("prompt", { prompt: "primo" }), opz);
    const secondo = await hook("prompt", input("prompt", { prompt: "secondo" }), opz);
    assert.equal(contesto(secondo.stdout), avviso);
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
    amb.configura({ url: srv.url, mcp_registrato_il: new Date(Date.now() - 3600_000).toISOString() });
    await hook("session_start", input("session_start"), opz);
    const transcript = join(amb.dir, "t.jsonl");
    writeFileSync(transcript, TRANSCRIPT + JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Grep" }] } }) + "\n");
    const r = await hook("stop", input("stop", { transcript_path: transcript }), opz);
    assert.deepEqual(JSON.parse(r.stdout), {
      decision: "block",
      reason: `[forgia] Prima di chiudere chiama aggiorna_stato (session_id=${sid}): fatto, prossimo, bloccato_da in frasi brevi. Poi termina senza ripetere la risposta.`,
    });
    const di = await hook("stop", input("stop", { transcript_path: transcript, stop_hook_active: true }), opz);
    assert.equal(di.stdout, "");
    const stop = srv.eventi().filter((e) => e.tipo === "stop").map((e) => e.dati);
    assert.deepEqual(stop, [
      { strumenti_nel_turno: 3, resoconto_inviato: false, bloccato: true, titolo: null },
      { strumenti_nel_turno: 3, resoconto_inviato: false, bloccato: false, titolo: null },
    ]);
  });

  test("stop: MCP registrato dopo l'avvio o modalità leggera locale non bloccano", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    amb.configura({ url: srv.url, mcp_registrato_il: new Date(Date.now() - 3600_000).toISOString() });
    await hook("session_start", input("session_start"), opz);
    amb.configura({ url: srv.url, mcp_registrato_il: new Date(Date.now() + 3600_000).toISOString() });
    const transcript = join(amb.dir, "t.jsonl");
    writeFileSync(transcript, TRANSCRIPT + JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Grep" }] } }) + "\n");
    assert.equal((await hook("stop", input("stop", { transcript_path: transcript }), opz)).stdout, "");
    amb.configura({ url: srv.url, mcp_registrato_il: "2000-01-01T00:00:00.000Z", modalita_resoconto: "leggero" });
    assert.equal((await hook("stop", input("stop", { transcript_path: transcript }), opz)).stdout, "");
  });

  test("stop e session_end portano il titolo della sessione dal transcript", async (t) => {
    const { srv, input, opz } = await preparato(t);
    await hook("session_start", input("session_start"), opz);
    await hook("stop", input("stop", { transcript_path: TITOLI }), opz);
    await hook("session_end", input("session_end", { reason: "prompt_input_exit", transcript_path: TITOLI }), opz);
    const [stop, fine] = srv.eventi().slice(1);
    assert.equal(stop.dati.titolo, "fix login mobile");
    assert.deepEqual(fine.dati, { reason: "prompt_input_exit", titolo: "fix login mobile" });
  });

  test("session_end con reason e transcript assente: titolo null", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    await hook("session_start", input("session_start"), opz);
    await hook("session_end", input("session_end", { reason: "prompt_input_exit", transcript_path: join(amb.dir, "manca.jsonl") }), opz);
    assert.deepEqual(srv.eventi().at(-1).dati, { reason: "prompt_input_exit", titolo: null });
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

describe("comandi dalla dashboard", () => {
  const ETICHETTA = "[forgia] Comando dalla dashboard (non scritto in questa sessione):";
  /** Ambiente con i comandi accesi; il server risponde con `comandi` agli eventi del tipo dato, una volta. */
  async function conComandi(t: Parameters<typeof preparato>[0], tipo: string, comandi: unknown = [{ id: 1, testo: "esegui i test" }], accesi = true) {
    let dati = false;
    const p = await preparato(t, (r) => {
      if (r.corpo?.tipo !== tipo || dati) return undefined;
      dati = true;
      return { corpo: { ...RISPOSTA, comandi } };
    });
    p.amb.configura({ url: p.srv.url, comandi: accesi });
    await hook("session_start", p.input("session_start"), p.opz);
    return p;
  }
  const blocco = (stdout: string) => JSON.parse(stdout).reason as string;

  test("area di default: niente comandi: true; accesi: in ogni evento salvo domanda e session_end", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    await hook("session_start", input("session_start"), opz);
    await hook("prompt_invio", input("prompt", { prompt: "x" }), opz);
    assert.ok(srv.eventi().every((e) => !("comandi" in e)));
    amb.configura({ url: srv.url, comandi: true });
    await hook("prompt_invio", input("prompt", { prompt: "x" }), opz);
    await hook("domanda", input("session_start", { hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_use_id: "toolu_1",
      tool_input: { questions: [{ question: "Procedo?", options: [{ label: "sì" }] }] } }), opz);
    await hook("session_end", input("session_end"), opz);
    assert.deepEqual(srv.eventi().slice(-3).map((e) => [e.tipo, e.comandi]), [["prompt", true], ["domanda", undefined], ["session_end", undefined]]);
  });

  test("comando a fine turno: block con l'etichetta e i comandi in ordine, anche con stop_hook_active; poi niente", async (t) => {
    const { input, opz } = await conComandi(t, "stop", [{ id: 1, testo: "esegui i test" }, { id: 2, testo: "poi il commit" }]);
    const r = await hook("stop", input("stop", { stop_hook_active: true }), opz);
    assert.equal(r.codice, 0);
    assert.equal(blocco(r.stdout), `${ETICHETTA}\n- esegui i test\n- poi il commit\nEseguili, poi termina il turno.`);
    assert.equal((await hook("stop", input("stop", { stop_hook_active: true }), opz)).stdout, "");
  });

  test("comando e resoconto insieme: il blocco porta il comando, il resoconto arriva allo stop dopo", async (t) => {
    const { srv, amb, sid, input, opz } = await conComandi(t, "stop");
    amb.configura({ url: srv.url, comandi: true, mcp_registrato_il: new Date(Date.now() - 3600_000).toISOString() });
    await hook("session_start", input("session_start"), opz);
    const transcript = join(amb.dir, "t.jsonl");
    writeFileSync(transcript, TRANSCRIPT + JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Grep" }] } }) + "\n");
    assert.match(blocco((await hook("stop", input("stop", { transcript_path: transcript }), opz)).stdout), /^\[forgia\] Comando dalla dashboard/);
    const dopo = await hook("stop", input("stop", { transcript_path: transcript, stop_hook_active: true }), opz);
    assert.match(blocco(dopo.stdout), new RegExp(`aggiorna_stato \\(session_id=${sid}\\)`));
    assert.equal((await hook("stop", input("stop", { transcript_path: transcript, stop_hook_active: true }), opz)).stdout, "");
  });

  test("arrivato con un todo: il prompt dopo lo ha nel contesto con l'etichetta, quello seguente no", async (t) => {
    const { input, opz } = await conComandi(t, "todo");
    await hook("todo", input("todowrite"), opz);
    const primo = await hook("prompt", input("prompt", { prompt: "ciao" }), opz);
    assert.equal(contesto(primo.stdout), `${ETICHETTA}\n- esegui i test\nEseguili insieme al messaggio dell'utente.`);
    assert.equal((await hook("prompt", input("prompt", { prompt: "ancora" }), opz)).stdout, "");
  });

  test("lo stesso comando in due risposte arriva una volta sola", async (t) => {
    const { srv, amb, input, opz } = await preparato(t, (r) => (r.corpo?.tipo === "todo" ? { corpo: { ...RISPOSTA, comandi: [{ id: 7, testo: "una volta" }] } } : undefined));
    amb.configura({ url: srv.url, comandi: true });
    await hook("session_start", input("session_start"), opz);
    for (let i = 0; i < 2; i++) await hook("todo", input("todowrite"), opz);
    assert.equal(blocco((await hook("stop", input("stop"), opz)).stdout), `${ETICHETTA}\n- una volta\nEseguili, poi termina il turno.`);
  });

  test("area spenta: i comandi in una risposta si ignorano", async (t) => {
    const { input, opz } = await conComandi(t, "stop", undefined, false);
    assert.equal((await hook("stop", input("stop"), opz)).stdout, "");
    assert.doesNotMatch((await hook("prompt", input("prompt", { prompt: "ciao" }), opz)).stdout, /Comando dalla dashboard/);
  });

  test("fail-open: comandi malformati o cache illeggibile non cambiano exit code e non scrivono su stderr", async (t) => {
    const { amb, sid, input, opz } = await conComandi(t, "stop", "boh");
    const r = await hook("stop", input("stop"), opz);
    assert.deepEqual([r.codice, r.stdout, r.stderr], [0, "", ""]);
    mkdirSync(amb.cache("comandi", sid), { recursive: true });
    writeFileSync(amb.cache("comandi", sid, "5.json"), "{rotto");
    const x = await hook("prompt", input("prompt", { prompt: "ciao" }), opz);
    assert.deepEqual([x.codice, x.stderr], [0, ""]);
    assert.doesNotMatch(x.stdout, /Comando dalla dashboard/);
    writeFileSync(amb.cache("sessioni", `${sid}.json`), "{rotto");
    for (const nome of ["stop", "prompt"]) {
      const x = await hook(nome, input(nome, { prompt: "ciao" }), opz);
      assert.deepEqual([x.codice, x.stderr], [0, ""], nome);
    }
  });
});

describe("copia dei change OpenSpec", () => {
  // Una cartella openspec/ di prova: un change attivo con file ammessi e non, un archiviato.
  function openspecDiProva(radice: string) {
    const change = join(radice, "openspec", "changes", "export-pdf");
    mkdirSync(join(change, "specs", "server", "export"), { recursive: true });
    mkdirSync(join(change, "idee"), { recursive: true });
    mkdirSync(join(radice, "openspec", "changes", "archive", "2026-10-20-vecchio-parser"), { recursive: true });
    writeFileSync(join(radice, "openspec", "changes", "archive", "2026-10-20-vecchio-parser", "tasks.md"), "- [x] 1.1 fatto\n");
    mkdirSync(join(radice, "src"), { recursive: true });
    writeFileSync(join(radice, ".env"), "SEGRETO=1");
    writeFileSync(join(radice, "src", "config.ts"), "export const segreto = 1;");
    writeFileSync(join(change, ".openspec.yaml"), "schema: spec-driven\n");
    writeFileSync(join(change, "proposal.md"), "# Proposta\n");
    writeFileSync(join(change, "tasks.md"), "- [ ] 1.1 primo\n- [ ] 1.2 secondo\n");
    writeFileSync(join(change, "specs", "server", "export", "spec.md"), "# Spec\n");
    writeFileSync(join(change, "idee", "appunti.txt"), "appunti\n");
    writeFileSync(join(change, "idee", "schema.pdf"), "%PDF");
    writeFileSync(join(change, "note.json"), "{}");
    writeFileSync(join(change, "design.md"), "x".repeat(256 * 1024 + 1));
    return change;
  }

  test("manda solo i file ammessi e gli archiviati; niente se nulla è cambiato; di nuovo dopo un task spuntato", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    const change = openspecDiProva(amb.progetto);
    const r = await hook("copia", input("stop"), opz);
    assert.deepEqual([r.codice, r.stdout], [0, ""]);
    const [copia] = srv.copie();
    assert.deepEqual([copia.metodo, copia.percorso, copia.auth], ["PUT", "/api/v1/progetti/prova/openspec", `Bearer ${TOKEN}`]);
    assert.deepEqual(copia.corpo.archiviati, [{ change: "vecchio-parser", archiviato_il: "2026-10-20", file: [{ percorso: "tasks.md", contenuto: "- [x] 1.1 fatto\n" }] }]);
    const [attivo] = copia.corpo.attivi;
    assert.equal(attivo.change, "export-pdf");
    assert.deepEqual(attivo.file.map((f: any) => f.percorso), [".openspec.yaml", "idee/appunti.txt", "proposal.md", "specs/server/export/spec.md", "tasks.md"]);
    assert.ok(!Number.isNaN(Date.parse(attivo.modificato_il)));
    assert.ok(!JSON.stringify(copia.corpo).includes("SEGRETO") && !JSON.stringify(copia.corpo).includes("segreto"));

    await hook("copia", input("stop"), opz);
    assert.equal(srv.copie().length, 1, "nulla di cambiato: nessun invio");

    writeFileSync(join(change, "tasks.md"), "- [x] 1.1 primo\n- [ ] 1.2 secondo\n");
    await hook("copia", input("stop"), opz);
    assert.equal(srv.copie().length, 2);
    assert.match(srv.copie()[1].corpo.attivi[0].file.find((f: any) => f.percorso === "tasks.md").contenuto, /\[x\] 1\.1/);
  });

  test("area senza openspec/: niente; server giù: exit 0 e la copia riparte allo stop dopo", async (t) => {
    const { srv, amb, input, opz } = await preparato(t);
    await hook("copia", input("stop"), opz);
    assert.equal(srv.copie().length, 0);
    openspecDiProva(amb.progetto);
    amb.configura({ url: await portaChiusa() });
    const r = await hook("copia", input("stop"), opz);
    assert.deepEqual([r.codice, r.stdout, r.stderr], [0, "", ""]);
    amb.configura({ url: srv.url });
    await hook("copia", input("stop"), opz);
    assert.equal(srv.copie().length, 1);
  });
});
