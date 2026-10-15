import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sql } from "kysely";
import { apriDb, migra, migrazioniMancanti } from "../src/db.ts";

test("migrazioni: database vuoto, seconda esecuzione, WAL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "forgia-db-"));
  const db = await apriDb(`sqlite:${join(dir, "m.db")}`);
  try {
    assert.deepEqual(await migrazioniMancanti(db), ["0001_iniziale"]);
    assert.deepEqual(await migra(db), ["0001_iniziale"]);
    assert.deepEqual(await migrazioniMancanti(db), []);
    assert.deepEqual(await migra(db), []);
    const registrate = await sql<{ name: string }>`select name from kysely_migration`.execute(db);
    assert.deepEqual(registrate.rows.map((r) => r.name), ["0001_iniziale"]);
    const { rows } = await sql<{ journal_mode: string }>`pragma journal_mode`.execute(db);
    assert.equal(rows[0].journal_mode, "wal");
  } finally {
    await db.destroy();
    await rm(dir, { recursive: true, force: true });
  }
});
