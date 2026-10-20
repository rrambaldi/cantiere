import assert from "node:assert/strict";
import { test } from "node:test";
import { campi, contaTask, KEBAB, nomeChange, percorsoAmmesso, segmenti, slugifica } from "../src/modelli.ts";

const changeDi = (percorso: string) => nomeChange(segmenti(percorso).map(slugifica));

test("slug e nome del change dagli esempi delle specs, conformi alla regola kebab di OpenSpec", () => {
  const casi: [string, string][] = [
    ["iDOC converter/Pre-prod", "idoc-converter-pre-prod"],
    ["tassi BCE,BoJ,SNB", "tassi-bce-boj-snb"],
    ["idoc-converter/preprod", "idoc-converter-preprod"],
    ["Città è già", "citta-e-gia"],
  ];
  for (const [percorso, change] of casi) {
    assert.equal(changeDi(percorso), change);
    assert.match(change, KEBAB);
  }
  assert.equal(slugifica("  --  "), "");
  assert.equal(campi.nome.safeParse("idoc-converter//preprod").success, false, "segmento vuoto");
  assert.equal(campi.nomeSemplice.safeParse("a/b").success, false);
});

test("nomi dei committenti: riservati, barre e vuoti rifiutati", () => {
  for (const nome of ["PRIV", "CVSTUDIO", "dgt_2", "Penta-Qo"]) assert.ok(campi.committente.safeParse(nome).success, nome);
  for (const nome of ["API", "mcp", "Ui", "PRIV/test", "", "con spazio", "x".repeat(65)]) assert.equal(campi.committente.safeParse(nome).success, false, nome);
});

test("caselle dei task contate come OpenSpec", () => {
  const tasks = "# Tasks\n- [x] 1.1 a\n- [X] 1.2 b\n- [ ] 1.3 c\n  - [ x] 1.4 d\n- [~] 1.5 e\n- [] 1.6 f\nTesto - [x] non in testa\n- [link](x) non è una casella\n- [ ]";
  assert.deepEqual(contaTask(tasks), { fatti: 3, totali: 7, aperti: ["1.3 c", "1.5 e", "1.6 f", ""] });
});

test("task aperti: il testo continua sulle righe rientrate, non oltre una riga vuota o una casella", () => {
  const tasks = "- [ ] 4.4 Cancellare i file. Verifica: `ls` non\n  trova niente.\n\n  Nota a parte.\n- [ ] 4.5 a\n  - [ ] 4.6 b\n  - punto";
  assert.deepEqual(contaTask(tasks).aperti, ["4.4 Cancellare i file. Verifica: `ls` non trova niente.", "4.5 a", "4.6 b"]);
  assert.deepEqual(contaTask(tasks.replace(/\n/g, "\r\n")).aperti, contaTask(tasks).aperti, "fine riga CRLF");
  assert.deepEqual(contaTask("\uFEFF- [ ] 1.1 a\n- [x] 1.2 b"), { fatti: 1, totali: 2, aperti: ["1.1 a"] }, "BOM in testa al file");
});

test("percorsi ammessi nella copia dei change", () => {
  for (const p of [".openspec.yaml", "proposal.md", "design.md", "tasks.md", "specs/server/a/spec.md", "idee/nota.md", "idee/sotto/appunti.txt"]) assert.ok(percorsoAmmesso(p), p);
  for (const p of ["../../.env", "/etc/passwd", "src/config.ts", "specs/../x.md", "idee/x.pdf", "specs/a.txt", "idee//x.md", "README.md"]) assert.equal(percorsoAmmesso(p), false, p);
});
