import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { leggiConfig } from "../src/config.ts";

const CONFIG = fileURLToPath(new URL("../src/config.ts", import.meta.url));
const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));

test("default della spec", () => {
  assert.deepEqual(leggiConfig({}), {
    database_url: "sqlite:forgia.db",
    bind: "127.0.0.1:8765",
    public_host: "",
    modalita_resoconto: "forzato",
    soglia_strumenti: 3,
    hint_max: 3,
    inattivita_minuti: 30,
    retention_giorni: 180,
    rate_limit: 120,
    max_body: 65536,
  });
});

test("l'ambiente vince sul file .env caricato da Node", () => {
  const dir = mkdtempSync(join(tmpdir(), "forgia-env-"));
  try {
    const file = join(dir, ".env");
    writeFileSync(file, "FORGIA_SOGLIA_STRUMENTI=3\nFORGIA_HINT_MAX=7\n");
    const leggi = (env: NodeJS.ProcessEnv) =>
      spawnSync(
        process.execPath,
        [`--env-file=${file}`, "--input-type=module", "-e", `const { leggiConfig } = await import(${JSON.stringify(CONFIG)}); const c = leggiConfig(); console.log(c.soglia_strumenti, c.hint_max);`],
        { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" },
      ).stdout.trim();
    assert.equal(leggi({}), "3 7");
    assert.equal(leggi({ FORGIA_SOGLIA_STRUMENTI: "5" }), "5 7");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("un valore non valido nomina la chiave e ferma l'avvio", () => {
  assert.throws(() => leggiConfig({ FORGIA_MODALITA_RESOCONTO: "sempre" }), /FORGIA_MODALITA_RESOCONTO/);
  const avvio = spawnSync(process.execPath, [MAIN], {
    env: { PATH: process.env.PATH, FORGIA_MODALITA_RESOCONTO: "sempre" },
    encoding: "utf8",
  });
  assert.equal(avvio.status, 1);
  assert.match(avvio.stderr, /FORGIA_MODALITA_RESOCONTO/);
});
