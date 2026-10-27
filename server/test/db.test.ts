import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sql, type Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import { apriDb, migra, migrazioniMancanti } from "../src/db.ts";
import * as iniziale from "../src/migrazioni/0001_iniziale.ts";

const tabelle = async (db: Kysely<any>) =>
  (await sql<{ name: string }>`select name from sqlite_master where type = 'table' and name not like 'kysely%' and name not like 'sqlite%' order by name`.execute(db)).rows.map((r) => r.name);

async function conDb(f: (db: Awaited<ReturnType<typeof apriDb>>) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "forgia-db-"));
  const db = await apriDb(`sqlite:${join(dir, "m.db")}`);
  try {
    await f(db);
  } finally {
    await db.destroy();
    await rm(dir, { recursive: true, force: true });
  }
}

test("migrazioni: database vuoto, seconda esecuzione, WAL", () =>
  conDb(async (db) => {
    assert.deepEqual(await migrazioniMancanti(db), ["0001_iniziale", "0002_committenti", "0003_domande", "0004_legami", "0005_subagenti", "0006_comandi"]);
    assert.deepEqual(await migra(db), ["0001_iniziale", "0002_committenti", "0003_domande", "0004_legami", "0005_subagenti", "0006_comandi"]);
    assert.deepEqual(await migrazioniMancanti(db), []);
    assert.deepEqual(await migra(db), []);
    const registrate = await sql<{ name: string }>`select name from kysely_migration order by name`.execute(db);
    assert.deepEqual(registrate.rows.map((r) => r.name), ["0001_iniziale", "0002_committenti", "0003_domande", "0004_legami", "0005_subagenti", "0006_comandi"]);
    assert.deepEqual(await tabelle(db), ["cantieri", "change_copie", "change_file", "comandi", "committenti", "domande", "esiti", "eventi", "idee_file", "legami", "progetti", "sessioni", "stati", "todo"]);
    const { rows } = await sql<{ journal_mode: string }>`pragma journal_mode`.execute(db);
    assert.equal(rows[0].journal_mode, "wal");
  }));

test("database v1 con dati: la 0002 elimina le tabelle v1 e riparte da vuoto", () =>
  conDb(async (db) => {
    // Solo la 0001, come un database di sviluppo di forgia v1.
    const soloV1 = new Migrator({ db, provider: { getMigrations: async () => ({ "0001_iniziale": iniziale }) } });
    await soloV1.migrateToLatest();
    await sql`insert into clienti (nome, token_hash, creato_il) values ('portatile', 'h', 'ieri')`.execute(db);
    await sql`insert into cantieri (nome, slug, origine, stato, creato_il, aggiornato_il) values ('vecchio', 'vecchio', 'auto', 'aperto', 'ieri', 'ieri')`.execute(db);
    assert.deepEqual(await migra(db), ["0002_committenti", "0003_domande", "0004_legami", "0005_subagenti", "0006_comandi"]);
    const nomi = await tabelle(db);
    assert.ok(!nomi.includes("clienti"));
    for (const t of ["cantieri", "committenti", "progetti", "sessioni"]) {
      const { rows } = await sql<{ n: number }>`select count(*) as n from ${sql.table(t)}`.execute(db);
      assert.equal(rows[0].n, 0, t);
    }
  }));
