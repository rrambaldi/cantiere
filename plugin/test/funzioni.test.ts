import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { contaTurno, datiTodo, decidiBlocco, normalizzaRepo, normalizzaUrl, riconosci } from "../bin/forgia.mts";
import { DATI, TRANSCRIPT } from "./aiuti.ts";

describe("normalizzaRepo", () => {
  for (const [url, atteso] of [
    ["https://user:ghp_abc123@github.com/org/repo.git", "github.com/org/repo"],
    ["git@github.com:org/repo.git", "github.com/org/repo"],
    ["ssh://git@github.com:22/org/repo.git", "github.com/org/repo"],
    ["https://gitlab.example.com:8443/team/app/", "gitlab.example.com/team/app"],
    ["https://oauth2:tok@GitLab.Example.com/team/app", "gitlab.example.com/team/app"],
    ["/srv/git/repo.git", null],
  ] as const) {
    test(url, () => assert.equal(normalizzaRepo(url), atteso));
  }
});

describe("riconosci /cantiere", () => {
  test("nome con descrizione", () =>
    assert.deepEqual(riconosci("/cantiere oauth-logiquo — login con Logiquo"),
      { op: "apri", nome: "oauth-logiquo", padre: null, descrizione: "login con Logiquo" }));
  test("descrizione dopo --", () =>
    assert.deepEqual(riconosci("/cantiere oauth -- login"), { op: "apri", nome: "oauth", padre: null, descrizione: "login" }));
  test("padre con --padre o nel nome a percorso", () => {
    assert.deepEqual(riconosci("/cantiere oauth --padre logiquo-v2 — login"),
      { op: "apri", nome: "oauth", padre: "logiquo-v2", descrizione: "login" });
    assert.deepEqual(riconosci("/cantiere logiquo-v2/oauth — login"),
      { op: "apri", nome: "logiquo-v2/oauth", padre: null, descrizione: "login" });
    assert.deepEqual(riconosci("/cantiere --padre logiquo-v2"), { op: null });
  });
  test("prefisso del plugin e chiusura", () =>
    assert.deepEqual(riconosci("/forgia:cantiere chiudi sospeso"), { op: "chiudi", esito: "sospeso", nota: null, forza: false }));
  test("chiusura forzata con -f o --force", () => {
    assert.deepEqual(riconosci("/cantiere chiudi -f sospeso"), { op: "chiudi", esito: "sospeso", nota: null, forza: true });
    assert.deepEqual(riconosci("/cantiere chiudi --force"), { op: "chiudi", esito: "completato", nota: null, forza: true });
  });
  test("chiusura con nota e esito di default", () => {
    assert.deepEqual(riconosci("/cantiere chiudi abbandonato non serve più"), { op: "chiudi", esito: "abbandonato", nota: "non serve più", forza: false });
    assert.deepEqual(riconosci("/cantiere chiudi"), { op: "chiudi", esito: "completato", nota: null, forza: false });
  });
  test("esito non valido: nessuna operazione", () => assert.deepEqual(riconosci("/cantiere chiudi finito"), { op: null }));
  test("forme gestite dal comando", () => {
    for (const p of ["/cantiere", "/cantiere stato", "/cantiere server", "/cantiere server https://x.example nome",
      "/cantiere permessi", "/cantiere on", "/forgia:cantiere off"]) {
      assert.deepEqual(riconosci(p), { op: null }, p);
    }
  });
  test("comandi simili ma diversi", () => {
    for (const p of ["/cantieri", "/cantiere-x prova", "fai /cantiere x", "cantiere x"]) assert.equal(riconosci(p), null, p);
  });
});

describe("datiTodo sui payload registrati", () => {
  const t = (nome: string, noti = {}) => datiTodo(DATI[nome].tool_name, DATI[nome].tool_input, DATI[nome].tool_response, noti);
  test("TodoWrite: lista intera", () =>
    assert.deepEqual(t("todowrite")?.dati, {
      strumento: "TodoWrite", completo: true,
      todos: [{ id: null, testo: "alfa", stato: "in_progress" }, { id: null, testo: "beta", stato: "pending" }],
    }));
  test("TaskCreate: id dalla risposta", () =>
    assert.deepEqual(t("taskcreate")?.dati, { strumento: "TaskCreate", completo: false, todos: [{ id: "1", testo: "alfa", stato: "pending" }] }));
  test("TaskUpdate: testo dalla task già vista", () => {
    const noti = t("taskcreate")!.noti;
    assert.deepEqual(t("taskupdate_completed", noti)?.dati.todos, [{ id: "1", testo: "alfa", stato: "completed" }]);
  });
  test("TaskUpdate su una task mai vista: stato dall'input", () =>
    assert.deepEqual(t("taskupdate_deleted")?.dati.todos, [{ id: "2", testo: "", stato: "deleted" }]));
  test("forme sconosciute: niente", () => {
    assert.equal(datiTodo("TaskUpdate", {}, {}, {}), null);
    assert.equal(datiTodo("TaskCreate", { subject: "x" }, {}, {}), null);
    assert.equal(datiTodo("TodoWrite", { todos: [{ content: "x", status: "boh" }] }, {}, {}), null);
    assert.equal(datiTodo("TaskList", {}, {}, {}), null);
  });
});

describe("contaTurno", () => {
  const dir = mkdtempSync(join(tmpdir(), "forgia-transcript-"));
  const file = (nome: string, testo: string) => {
    const p = join(dir, nome);
    writeFileSync(p, testo);
    return p;
  };
  const uso = (nome: string) => JSON.stringify({ type: "assistant", isSidechain: false, message: { role: "assistant", content: [{ type: "tool_use", id: "x", name: nome, input: {} }] } });

  test("transcript registrato: Bash ed Edit contano, Task e il turno prima no", () =>
    assert.deepEqual(contaTurno(file("base.jsonl", TRANSCRIPT), "forgia"), { strumenti: 2, resoconto: false }));
  test("aggiorna_stato e altri tool MCP del server non contano, ma segnano il resoconto", () =>
    assert.deepEqual(contaTurno(file("mcp.jsonl", `${TRANSCRIPT}${uso("mcp__forgia__stato_sessione")}\n${uso("mcp__forgia__aggiorna_stato")}\n${uso("mcp__altro__x")}\n`), "forgia"),
      { strumenti: 3, resoconto: true }));
  test("i tool dei subagent (sidechain) non contano", () =>
    assert.deepEqual(contaTurno(file("side.jsonl", TRANSCRIPT + uso("Bash").replace('"isSidechain":false', '"isSidechain":true') + "\n"), "forgia"),
      { strumenti: 2, resoconto: false }));
  test("riga corrotta, forma inattesa o file assente: non affidabile", () => {
    assert.equal(contaTurno(file("rotto.jsonl", `${TRANSCRIPT}{non json\n`), "forgia"), null);
    assert.equal(contaTurno(file("forma.jsonl", `${TRANSCRIPT}{"type":"assistant","message":{"content":"testo"}}\n`), "forgia"), null);
    assert.equal(contaTurno(join(dir, "manca.jsonl"), "forgia"), null);
  });
  test("turno più lungo della prima finestra di lettura", () => {
    const grosso = JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "x".repeat(600_000) }] } });
    assert.deepEqual(contaTurno(file("grosso.jsonl", `${TRANSCRIPT}${uso("Read")}\n${grosso}\n${uso("Grep")}\n`), "forgia"), { strumenti: 4, resoconto: false });
  });
  test("pulizia", () => rmSync(dir, { recursive: true, force: true }));
});

describe("decidiBlocco", () => {
  const base = {
    attivo: false, conteggio: { strumenti: 5, resoconto: false }, modalita: "forzato" as const, soglia: 3,
    avvio: "2026-10-14T10:00:00.000Z", registrato: "2026-10-14T09:00:00.000Z",
  };
  test("tutte le condizioni: blocca", () => assert.equal(decidiBlocco(base), true));
  for (const [caso, variante] of [
    ["stop_hook_active", { attivo: true }],
    ["modalità leggero", { modalita: "leggero" }],
    ["modalità off", { modalita: "off" }],
    ["sotto soglia", { conteggio: { strumenti: 2, resoconto: false } }],
    ["resoconto già inviato", { conteggio: { strumenti: 5, resoconto: true } }],
    ["transcript non affidabile", { conteggio: null }],
    ["MCP registrato dopo l'avvio", { registrato: "2026-10-14T11:00:00.000Z" }],
    ["MCP mai registrato", { registrato: null }],
    ["avvio reale sconosciuto", { avvio: undefined }],
  ] as const) {
    test(`non blocca: ${caso}`, () => assert.equal(decidiBlocco({ ...base, ...variante }), false));
  }
  test("soglia raggiunta esatta: blocca", () => assert.equal(decidiBlocco({ ...base, conteggio: { strumenti: 3, resoconto: false } }), true));
});

describe("normalizzaUrl", () => {
  test("https e localhost in chiaro", () => {
    assert.equal(normalizzaUrl("https://forgia.example.org/"), "https://forgia.example.org");
    assert.equal(normalizzaUrl("http://localhost:8765"), "http://localhost:8765");
    assert.equal(normalizzaUrl("http://127.0.0.1:8765/"), "http://127.0.0.1:8765");
  });
  test("http remoto e URL rotti rifiutati", () => {
    assert.throws(() => normalizzaUrl("http://forgia.example.org"), /https/);
    assert.throws(() => normalizzaUrl("forgia.example.org"), /URL non valido/);
  });
});

test("bin/forgia.mjs è la compilazione aggiornata di bin/forgia.mts", () => {
  const out = mkdtempSync(join(tmpdir(), "forgia-build-"));
  const radice = fileURLToPath(new URL("../", import.meta.url));
  execFileSync(join(radice, "../node_modules/.bin/tsc"), ["-p", join(radice, "tsconfig.build.json"), "--outDir", out]);
  const compilato = readFileSync(join(out, "forgia.mjs"), "utf8");
  rmSync(out, { recursive: true, force: true });
  assert.equal(readFileSync(join(radice, "bin/forgia.mjs"), "utf8"), compilato, "rilancia: npx tsc -p plugin/tsconfig.build.json");
});
