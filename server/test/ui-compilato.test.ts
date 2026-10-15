import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const UI = fileURLToPath(new URL("../ui/", import.meta.url));
const TSC = fileURLToPath(new URL("../../node_modules/.bin/tsc", import.meta.url));

const elenca = (cartella: string) =>
  readdirSync(cartella, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(cartella.length + 1))
    .sort();

test("ui/dist è la compilazione aggiornata di ui/src", () => {
  const out = mkdtempSync(join(tmpdir(), "forgia-ui-"));
  try {
    execFileSync(TSC, ["-p", UI, "--outDir", out]);
    const attesi = elenca(out);
    assert.deepEqual(elenca(join(UI, "dist")), attesi, "rilancia: npx tsc -p server/ui");
    for (const f of attesi) {
      assert.equal(readFileSync(join(UI, "dist", f), "utf8"), readFileSync(join(out, f), "utf8"), `${f}: rilancia npx tsc -p server/ui`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("la pagina usa solo URL relativi e ha il segnaposto del committente", () => {
  const pagina = readFileSync(join(UI, "static/index.html"), "utf8");
  const url = [...pagina.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const locali = url.filter((u) => !u.startsWith("https://fonts.googleapis.com/"));
  assert.ok(locali.length >= 7);
  for (const u of locali) assert.match(u, /^ui\/(static|dist|vendor)\//, u);
  assert.match(pagina, /<meta name="forgia-committente" content="\{\{COMMITTENTE\}\}">/);
  assert.doesNotMatch(pagina, /style=/, "niente stili in linea: la CSP non li ammette");
});
