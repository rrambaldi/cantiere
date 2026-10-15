import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { autentica, hashToken } from "../src/accesso.ts";
import { apriDb } from "../src/db.ts";
import { creaProgetto } from "../src/dominio.ts";
import { tsFa } from "./aiuto.ts";

const ADMIN = fileURLToPath(new URL("../src/admin.ts", import.meta.url));

describe("forgia-admin", () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "forgia-admin-"));
    env = { PATH: process.env.PATH, FORGIA_DATABASE_URL: `sqlite:${join(dir, "a.db")}` };
  });
  after(() => rm(dir, { recursive: true, force: true }));

  const admin = async (...args: string[]) => {
    try {
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [ADMIN, ...args], { env, encoding: "utf8" });
      return { codice: 0, stdout, stderr };
    } catch (e) {
      const errore = e as { code: number; stdout: string; stderr: string };
      return { codice: errore.code, stdout: errore.stdout, stderr: errore.stderr };
    }
  };
  const conDb = async <T>(f: (db: Awaited<ReturnType<typeof apriDb>>) => Promise<T>) => {
    const db = await apriDb(env.FORGIA_DATABASE_URL!);
    try {
      return await f(db);
    } finally {
      await db.destroy();
    }
  };

  test("migra", async () => {
    assert.match((await admin("migra")).stdout, /Applicate: 0001_iniziale, 0002_committenti/);
    assert.match((await admin("migra")).stdout, /già aggiornato/);
  });

  test("committente: crea una volta sola, elenca senza segreti, rigenera con effetto immediato", async () => {
    const crea = await admin("committente", "crea", "PRIV");
    const token = crea.stdout.trim();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(!crea.stderr.includes(token));
    assert.match(crea.stderr, /non verrà mostrato di nuovo/);
    const doppio = await admin("committente", "crea", "priv");
    assert.equal(doppio.codice, 1);
    assert.match(doppio.stderr, /Esiste già il committente "PRIV"/);

    const elenco = (await admin("committente", "elenca")).stdout;
    assert.match(elenco, /^committente\s+creato\s+ultimo_token\nPRIV\s/);
    assert.ok(!elenco.includes(token) && !elenco.includes(hashToken(token)));

    assert.notEqual(await conDb((db) => autentica(db, `Bearer ${token}`)), null);
    const rigenera = await admin("committente", "rigenera", "PRIV");
    assert.equal(rigenera.codice, 0);
    assert.equal(await conDb((db) => autentica(db, `Bearer ${token}`)), null);
    assert.notEqual(await conDb((db) => autentica(db, `Bearer ${rigenera.stdout.trim()}`)), null);
    assert.equal((await admin("committente", "crea")).codice, 1);
  });

  test("tabelle di progetti, sessioni e cantieri", async () => {
    await conDb(async (db) => {
      const ora = new Date().toISOString();
      const priv = await db.selectFrom("committenti").select("id").executeTakeFirstOrThrow();
      const progetto = await creaProgetto(db, priv.id, "mercurius");
      const { id } = await db
        .insertInto("cantieri")
        .values({ progetto_id: progetto.id, padre_id: null, nome: "tassi", slug: "tassi", percorso_slug: "tassi", change: "tassi", descrizione: null, stato: "aperto", origine: "utente", creato_il: ora, aggiornato_il: ora, stato_il: ora })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db.insertInto("change_copie").values({ cantiere_id: id, modificato_il: ora, archiviato_il: null, visto_il: ora, artefatti: "{}", task_fatti: 2, task_totali: 5 }).execute();
      await db
        .insertInto("sessioni")
        .values({ session_id: "abcdef123456", committente_id: priv.id, progetto_id: progetto.id, cantiere_id: id, origine_associazione: "utente", stato: "lavorando", turni: 2, titolo: null, avviso: null, host: "fisso", cwd: "/x", repo: null, branch: "main", avviata_il: ora, ultimo_evento_il: ora, chiusa_il: null, ultimo_ts_stato: null, ultimo_ts_todo: null })
        .execute();
    });
    const progetti = (await admin("progetti")).stdout.split("\n");
    assert.match(progetti[0], /^committente\s+progetto\s+idea\s+aperto\s+sospeso\s+completato\s+abbandonato$/);
    assert.match(progetti[1], /^PRIV\s+mercurius\s+0\s+1\s+0\s+0\s+0$/);
    const cantieri = (await admin("cantieri")).stdout.split("\n");
    assert.match(cantieri[0], /^id\s+committente\s+progetto\s+percorso\s+stato\s+change\s+avanzamento\s+sessioni_attive\s+aggiornato$/);
    assert.match(cantieri[1], /PRIV\s+mercurius\s+tassi\s+aperto\s+tassi\s+2\/5\s+1\s/);
    const sessioni = (await admin("sessioni")).stdout;
    assert.match(sessioni, /abcdef12\s+PRIV\s+mercurius\s+fisso\s+main\s+tassi\s+lavorando\s+2/);
  });

  test("pulizia: solo eventi e stati oltre la retention", async () => {
    await conDb(async (db) => {
      const evento = (id: string, giorni: number) => ({
        evento_id: id, ts: tsFa(giorni * 86400), ricevuto_il: tsFa(giorni * 86400), committente_id: 1, session_id: "s", progetto_id: 1,
        cantiere_id: null, tipo: "prompt", dati: "{}", codice_http: 200, risposta: "{}",
      });
      await db.insertInto("eventi").values([evento("vecchio", 200), evento("recente", 1)]).execute();
      await db.insertInto("stati").values({ session_id: "s", progetto_id: 1, cantiere_id: null, ts: tsFa(200 * 86400), fatto: "f", prossimo: "p", bloccato_da: null, percentuale: null }).execute();
    });
    assert.match((await admin("pulizia")).stdout, /Eliminati 1 eventi e 1 stati più vecchi di 180 giorni/);
    const rimasti = await conDb((db) => db.selectFrom("eventi").select("evento_id").execute());
    assert.deepEqual(rimasti.map((r) => r.evento_id), ["recente"]);
  });
});
