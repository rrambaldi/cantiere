import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
// Le tabelle che appartengono a un committente si leggono solo dagli helper di ambito.ts (design D3).
const NUDA = /selectFrom\(\s*["'`](progetti|cantieri|sessioni)\b/;
const ESENTI = new Set(["ambito.ts", "db.ts"]);

async function violazioni(cartella: string): Promise<string[]> {
  const trovate = [];
  for (const nome of await readdir(cartella)) {
    if (!nome.endsWith(".ts") || ESENTI.has(nome)) continue;
    for (const [i, riga] of (await readFile(join(cartella, nome), "utf8")).split("\n").entries()) {
      if (NUDA.test(riga)) trovate.push(`${nome}:${i + 1}`);
    }
  }
  return trovate;
}

test("il dominio legge progetti, cantieri e sessioni solo con gli helper dell'ambito", async () => {
  assert.deepEqual(await violazioni(SRC), []);
});

test("il controllo trova una lettura nuda", async () => {
  const dir = await mkdtemp(join(tmpdir(), "forgia-arch-"));
  try {
    await writeFile(join(dir, "prova.ts"), 'const x = db.selectFrom("cantieri").selectAll();\n');
    assert.deepEqual(await violazioni(dir), ["prova.ts:1"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
