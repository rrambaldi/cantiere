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
    assert.match((await admin("migra")).stdout, /Applicate: 0001_iniziale/);
    assert.match((await admin("migra")).stdout, /già aggiornato/);
  });

  test("token: crea una volta sola, elenca senza segreti, revoca immediata", async () => {
    const crea = await admin("token", "crea", "--cliente", "portatile");
    const token = crea.stdout.trim();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(!crea.stderr.includes(token));
    const doppio = await admin("token", "crea", "--cliente", "portatile");
    assert.equal(doppio.codice, 1);
    assert.match(doppio.stderr, /Esiste già un cliente attivo/);

    const elenco = (await admin("token", "elenca")).stdout;
    assert.match(elenco, /portatile/);
    assert.ok(!elenco.includes(token) && !elenco.includes(hashToken(token)));

    assert.notEqual(await conDb((db) => autentica(db, `Bearer ${token}`)), null);
    assert.equal((await admin("token", "revoca", "--cliente", "portatile")).codice, 0);
    assert.equal(await conDb((db) => autentica(db, `Bearer ${token}`)), null);
  });

  test("tabelle di sessioni e cantieri", async () => {
    await conDb(async (db) => {
      const ora = new Date().toISOString();
      const { id } = await db
        .insertInto("cantieri")
        .values({ nome: "oauth-logiquo", slug: "oauth-logiquo", slug_aperto: "oauth-logiquo", descrizione: null, origine: "utente", stato: "aperto", esito: null, nota: null, repo: null, branch: null, creato_il: ora, aggiornato_il: ora, chiuso_il: null })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db
        .insertInto("sessioni")
        .values({ session_id: "abcdef123456", cliente_id: 1, host: "fisso", cwd: "/x", repo: null, branch: "main", cantiere_id: id, origine_associazione: "utente", confermato: 1, stato: "lavorando", turni: 2, hint_inviati: 0, avviata_il: ora, ultimo_evento_il: ora, chiusa_il: null, ultimo_ts_stato: null, ultimo_ts_todo: null })
        .execute();
    });
    const cantieri = (await admin("cantieri")).stdout.split("\n");
    assert.match(cantieri[0], /^id\s+percorso\s+stato\s+origine\s+sessioni_attive\s+aggiornato$/);
    assert.match(cantieri[1], /oauth-logiquo\s+aperto\s+utente\s+1\s/);
    const sessioni = (await admin("sessioni")).stdout;
    assert.match(sessioni, /abcdef12\s+portatile\s+fisso\s+main\s+oauth-logiquo\s+lavorando\s+2/);
  });

  test("pulizia: solo eventi e stati oltre la retention", async () => {
    await conDb(async (db) => {
      const evento = (id: string, giorni: number) => ({
        evento_id: id, ts: tsFa(giorni * 86400), ricevuto_il: tsFa(giorni * 86400), cliente_id: 1, session_id: "s",
        cantiere_id: null, tipo: "prompt", dati: "{}", codice_http: 200, risposta: "{}",
      });
      await db.insertInto("eventi").values([evento("vecchio", 200), evento("recente", 1)]).execute();
      await db.insertInto("stati").values({ session_id: "s", cantiere_id: null, ts: tsFa(200 * 86400), fatto: "f", prossimo: "p", bloccato_da: null, percentuale: null }).execute();
    });
    assert.match((await admin("pulizia")).stdout, /Eliminati 1 eventi e 1 stati più vecchi di 180 giorni/);
    const rimasti = await conDb((db) => db.selectFrom("eventi").select("evento_id").execute());
    assert.deepEqual(rimasti.map((r) => r.evento_id), ["recente"]);
  });
});
