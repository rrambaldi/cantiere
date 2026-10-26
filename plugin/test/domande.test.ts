import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { datiDomanda } from "../bin/forgia.mts";
import { DATI, ambiente, hook, portaChiusa, serverFinto } from "./aiuti.ts";

// Le forme di PreToolUse, PostToolUse e Notification seguono la documentazione di Claude Code: non sono tra quelle registrate in dati/hook.json.
async function preparato(t: { after: (f: () => unknown) => void }) {
  const srv = await serverFinto();
  const amb = ambiente();
  amb.configura({ url: srv.url });
  t.after(async () => { await srv.chiudi(); amb.pulisci(); });
  const sid = randomUUID();
  const base = { ...DATI.prompt, session_id: sid, cwd: amb.progetto };
  const pre = (tool_input: object, tool_use_id = "toolu_01") => ({ ...base, hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_input, tool_use_id });
  const post = (tool_use_id = "toolu_01") => ({ ...base, hook_event_name: "PostToolUse", tool_name: "AskUserQuestion", tool_input: {}, tool_response: {}, tool_use_id });
  const notifica = (notification_type: string, message = "Claude needs your permission to use Bash") => ({ ...base, hook_event_name: "Notification", notification_type, message });
  // La sessione vista in ritardo manda un session_start prima del resto: qui interessano solo le domande.
  const ev = () => srv.eventi().filter((e) => e.tipo !== "session_start");
  return { srv, ev, amb, sid, base, pre, post, notifica, opz: { env: amb.env, cwd: amb.progetto } };
}

const unaDomanda = { questions: [{ question: "Quale branch?", header: "Branch", multiSelect: false, options: [{ label: "main", description: "il principale" }, { label: "dev", description: "sviluppo" }] }] };

describe("domande: lettura della chiamata", () => {
  test("una domanda: testo e opzioni a parte", () => {
    assert.deepEqual(datiDomanda(unaDomanda), { testo: "Quale branch?", opzioni: ["main", "dev"] });
  });

  test("più domande: un solo testo con ciascuna e le sue opzioni", () => {
    const d = datiDomanda({ questions: [...unaDomanda.questions, { question: "Procedo?", options: [{ label: "sì" }, { label: "no" }] }, { question: "Nome?", options: [] }] });
    assert.deepEqual(d, { testo: "1. Quale branch? (main / dev)\n2. Procedo? (sì / no)\n3. Nome?", opzioni: [] });
  });

  test("forma non leggibile: null; testo e opzioni troncati ai limiti del server", () => {
    assert.equal(datiDomanda(undefined), null);
    assert.equal(datiDomanda({ questions: [] }), null);
    const grande = datiDomanda({ questions: [{ question: "x".repeat(5000), options: Array.from({ length: 12 }, () => ({ label: "y".repeat(300) })) }] })!;
    assert.deepEqual([grande.testo.length, grande.opzioni.length, grande.opzioni[0].length], [4000, 10, 200]);
  });
});

describe("domande: hook", () => {
  test("domanda a scelta: evento con id della chiamata, testo e opzioni; nessun output", async (t) => {
    const { srv, ev, pre, opz } = await preparato(t);
    const r = await hook("domanda", pre(unaDomanda, "toolu_AB"), opz);
    assert.deepEqual([r.codice, r.stdout], [0, ""]);
    const [e] = ev();
    assert.deepEqual([e.tipo, e.dati], ["domanda", { id: "toolu_AB", tipo: "scelta", testo: "Quale branch?", opzioni: ["main", "dev"] }]);
  });

  test("subagente: evento con il solo tipo, mai prompt o descrizione; senza tipo è general-purpose", async (t) => {
    const { ev, base, opz } = await preparato(t);
    const agente = (tool_input: object) => ({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_input, tool_use_id: "toolu_AG" });
    const r = await hook("subagente", agente({ subagent_type: "Explore", description: "Cerca i test", prompt: "segreto del prompt" }), opz);
    assert.deepEqual([r.codice, r.stdout], [0, ""]);
    await hook("subagente", agente({ description: "x", prompt: "y" }), opz);
    assert.deepEqual(ev().map((e) => [e.tipo, e.dati]), [["subagente", { tipo: "Explore" }], ["subagente", { tipo: "general-purpose" }]]);
    assert.ok(!JSON.stringify(ev()).includes("segreto"));
  });

  test("risposta: evento con lo stesso id", async (t) => {
    const { srv, ev, post, opz } = await preparato(t);
    await hook("risposta", post("toolu_AB"), opz);
    const [e] = ev();
    assert.deepEqual([e.tipo, e.dati], ["risposta", { id: "toolu_AB" }]);
  });

  test("chiamata senza domande leggibili: niente", async (t) => {
    const { srv, ev, pre, opz } = await preparato(t);
    await hook("domanda", pre({}), opz);
    assert.equal(ev().length, 0);
  });

  test("richiesta di permesso e sessione inattiva: domanda di tipo attesa; una seconda notifica non manda nulla", async (t) => {
    const { srv, ev, notifica, opz } = await preparato(t);
    await hook("notifica", notifica("permission_prompt"), opz);
    await hook("notifica", notifica("idle_prompt", "Claude is waiting for your input"), opz);
    const eventi = ev();
    assert.equal(eventi.length, 1);
    assert.deepEqual([eventi[0].tipo, eventi[0].dati.tipo, eventi[0].dati.testo, eventi[0].dati.opzioni], ["domanda", "attesa", "Claude needs your permission to use Bash", []]);
  });

  test("altri tipi di notifica: niente", async (t) => {
    const { srv, ev, notifica, opz } = await preparato(t);
    await hook("notifica", notifica("auth_success", "ok"), opz);
    assert.equal(ev().length, 0);
  });

  test("notifica durante una domanda a scelta aperta: niente di doppio; dopo la risposta riparte", async (t) => {
    const { srv, ev, pre, post, notifica, opz } = await preparato(t);
    await hook("domanda", pre(unaDomanda), opz);
    await hook("notifica", notifica("permission_prompt"), opz);
    assert.equal(ev().length, 1);
    await hook("risposta", post(), opz);
    await hook("notifica", notifica("idle_prompt", "ferma"), opz);
    assert.deepEqual(ev().map((e) => e.tipo), ["domanda", "risposta", "domanda"]);
  });

  test("dopo stop e dopo un nuovo prompt una nuova attesa si può mandare", async (t) => {
    const { srv, ev, base, notifica, opz } = await preparato(t);
    await hook("notifica", notifica("permission_prompt"), opz);
    await hook("stop", { ...DATI.stop, session_id: base.session_id, cwd: base.cwd, transcript_path: join(base.cwd, "manca.jsonl") }, opz);
    await hook("notifica", notifica("idle_prompt", "ferma"), opz);
    await hook("prompt_invio", { ...base, prompt: "continua" }, opz);
    await hook("notifica", notifica("permission_prompt"), opz);
    assert.deepEqual(ev().filter((e) => e.tipo === "domanda").length, 3);
  });

  test("server giù: exit 0 senza output e la domanda resta in coda", async (t) => {
    const { amb, pre, opz } = await preparato(t);
    amb.configura({ url: await portaChiusa() });
    const r = await hook("domanda", pre(unaDomanda), opz);
    assert.deepEqual([r.codice, r.stdout], [0, ""]);
    assert.ok(r.ms < 2000, `${r.ms} ms`);
    const inCoda = readdirSync(amb.cache("coda")).map((f) => JSON.parse(readFileSync(amb.cache("coda", f), "utf8")).evento.tipo);
    assert.deepEqual(inCoda, ["session_start", "domanda"]); // il primo è la sessione vista in ritardo
  });

  test("esclusioni: .forgia-off, tracciamento spento, fuori da ogni area", async (t) => {
    const { srv, ev, amb, pre, post, notifica, opz } = await preparato(t);
    const tutti = async (cwd: string, env = amb.env) => {
      const o = { env, cwd };
      await hook("domanda", { ...pre(unaDomanda), cwd }, o);
      await hook("risposta", { ...post(), cwd }, o);
      await hook("notifica", { ...notifica("permission_prompt"), cwd }, o);
    };
    amb.configura({ url: srv.url, abilitato: false });
    await tutti(amb.progetto);
    amb.configura({ url: srv.url });
    await tutti(amb.progetto, { ...amb.env, FORGIA_DISABLED: "1" });
    const fuori = join(amb.dir, "altrove");
    mkdirSync(fuori);
    await tutti(fuori);
    execFileSync("git", ["init", "-q", amb.progetto]);
    writeFileSync(join(amb.progetto, ".forgia-off"), "");
    await tutti(amb.progetto);
    assert.equal(srv.richieste.length, 0);
    void opz;
  });
});
