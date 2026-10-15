import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { Kysely, PostgresDialect, SqliteDialect, type Generated } from "kysely";
import { Migrator, type Migration, type MigrationProvider } from "kysely/migration";
import type { Origine, StatoSessione } from "./modelli.ts";

export interface DB {
  clienti: {
    id: Generated<number>;
    nome: string;
    token_hash: string;
    creato_il: string;
    revocato_il: string | null;
  };
  cantieri: {
    id: Generated<number>;
    /** Cantiere padre; il percorso si ricostruisce salendo i padre_id. */
    padre_id: number | null;
    nome: string;
    slug: string;
    /** Uguale a slug finché il cantiere è aperto, NULL dopo: rende lo slug unico solo tra gli aperti. */
    slug_aperto: string | null;
    descrizione: string | null;
    origine: Origine;
    stato: "aperto" | "chiuso";
    esito: string | null;
    nota: string | null;
    repo: string | null;
    branch: string | null;
    creato_il: string;
    aggiornato_il: string;
    chiuso_il: string | null;
  };
  sessioni: {
    session_id: string;
    cliente_id: number;
    host: string;
    cwd: string;
    repo: string | null;
    branch: string | null;
    cantiere_id: number | null;
    origine_associazione: Origine | null;
    confermato: number;
    stato: StatoSessione;
    turni: number;
    hint_inviati: number;
    avviata_il: string;
    ultimo_evento_il: string;
    chiusa_il: string | null;
    ultimo_ts_stato: string | null;
    ultimo_ts_todo: string | null;
  };
  eventi: {
    id: Generated<number>;
    evento_id: string;
    ts: string;
    ricevuto_il: string;
    cliente_id: number;
    session_id: string;
    cantiere_id: number | null;
    tipo: string;
    dati: string;
    codice_http: number;
    risposta: string;
  };
  stati: {
    id: Generated<number>;
    session_id: string;
    cantiere_id: number | null;
    ts: string;
    fatto: string;
    prossimo: string;
    bloccato_da: string | null;
    percentuale: number | null;
  };
  todo: {
    session_id: string;
    chiave: string;
    testo: string;
    stato: string;
    ordine: number;
    aggiornato_il: string;
  };
}

export async function apriDb(url: string): Promise<Kysely<DB>> {
  if (url.startsWith("sqlite:")) {
    const database = new Database(url.slice("sqlite:".length));
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
    return new Kysely<DB>({ dialect: new SqliteDialect({ database }) });
  }
  if (/^postgres(ql)?:\/\//.test(url)) {
    // ParceEtRecte: pg non è tra le dipendenze finché si resta su SQLite; per PostgreSQL: npm install pg.
    const modulo = "pg";
    const { default: pg } = await import(modulo);
    return new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }) });
  }
  throw new Error("FORGIA_DATABASE_URL non supportato: usa sqlite:<file> oppure postgres://...");
}

/** Viola un vincolo di unicità? Codici di better-sqlite3 e di PostgreSQL. */
export function violaUnicita(errore: unknown): boolean {
  const codice = (errore as { code?: unknown } | null)?.code;
  return codice === "SQLITE_CONSTRAINT_UNIQUE" || codice === "SQLITE_CONSTRAINT_PRIMARYKEY" || codice === "23505";
}

const CARTELLA_MIGRAZIONI = fileURLToPath(new URL("./migrazioni/", import.meta.url));

// FileMigrationProvider di Kysely carica solo .js/.mjs/.cjs: questo legge i .ts.
const migrazioniTs: MigrationProvider = {
  async getMigrations() {
    const file = (await readdir(CARTELLA_MIGRAZIONI)).filter((f) => f.endsWith(".ts")).sort();
    const moduli = await Promise.all(
      file.map(async (f) => [f.slice(0, -3), (await import(pathToFileURL(join(CARTELLA_MIGRAZIONI, f)).href)) as Migration] as const),
    );
    return Object.fromEntries(moduli);
  },
};

const migratore = (db: Kysely<DB>) => new Migrator({ db, provider: migrazioniTs });

/** Applica le migrazioni mancanti e restituisce i nomi di quelle applicate. */
export async function migra(db: Kysely<DB>): Promise<string[]> {
  const { error, results = [] } = await migratore(db).migrateToLatest();
  if (error) throw error;
  return results.map((r) => r.migrationName);
}

export async function migrazioniMancanti(db: Kysely<DB>): Promise<string[]> {
  return (await migratore(db).getMigrations()).filter((m) => !m.executedAt).map((m) => m.name);
}
