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
  assert.deepEqual(contaTask(tasks), { fatti: 3, totali: 7 });
});

test("percorsi ammessi nella copia dei change", () => {
  for (const p of [".openspec.yaml", "proposal.md", "design.md", "tasks.md", "specs/server/a/spec.md", "idee/nota.md", "idee/sotto/appunti.txt"]) assert.ok(percorsoAmmesso(p), p);
  for (const p of ["../../.env", "/etc/passwd", "src/config.ts", "specs/../x.md", "idee/x.pdf", "specs/a.txt", "idee//x.md", "README.md"]) assert.equal(percorsoAmmesso(p), false, p);
});
