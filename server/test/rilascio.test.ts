import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { avvia, ui } from "./aiuto.ts";

const percorso = "../../scripts/rilascia.mjs"; // fuori dal controllo dei tipi: è uno script JavaScript
const { prossima } = (await import(percorso)) as { prossima: (corrente: string, data?: Date) => string };

test("release AA.MM.N: il numero riparte da 0 a ogni mese e sale nello stesso mese", () => {
  const giorno = (a: number, m: number) => new Date(a, m - 1, 15);
  assert.equal(prossima("0.3.0", giorno(2026, 10)), "26.10.0");
  assert.equal(prossima("26.10.0", giorno(2026, 10)), "26.10.1");
  assert.equal(prossima("26.10.1", giorno(2026, 10)), "26.10.2");
  assert.equal(prossima("26.10.2", giorno(2026, 11)), "26.11.0");
  assert.equal(prossima("26.12.4", giorno(2027, 1)), "27.1.0");
});

test("la versione è la stessa nel plugin, nel marketplace e nel server, e la dashboard la mostra", async () => {
  const leggi = (f: string) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"));
  const server = leggi("server/package.json").version;
  assert.match(server, /^\d{2}\.\d{1,2}\.\d+$/);
  assert.equal(leggi("plugin/.claude-plugin/plugin.json").version, server);
  assert.equal(leggi(".claude-plugin/marketplace.json").plugins[0].version, server);
  const b = await avvia();
  try {
    assert.equal((await ui(b, "/ui/api/albero")).corpo.release, server);
  } finally {
    await b.chiudi();
  }
});
