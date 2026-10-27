import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { Kysely, PostgresDialect, SqliteDialect, type Generated } from "kysely";
import { Migrator, type Migration, type MigrationProvider } from "kysely/migration";
import type { Origine, OrigineCantiere, StatoCantiere, StatoSessione, TipoLegame } from "./modelli.ts";

export interface DB {
  committenti: {
    id: Generated<number>;
    nome: string;
    /** Nome in minuscolo: rende il nome unico senza distinzione di maiuscole. */
    nome_chiave: string;
    token_hash: string;
    token_il: string;
    creato_il: string;
  };
  progetti: {
    id: Generated<number>;
    committente_id: number;
    nome: string;
    slug: string;
    creato_il: string;
    /** Ultima copia dei change OpenSpec ricevuta dal plugin. */
    openspec_il: string | null;
  };
  cantieri: {
    id: Generated<number>;
    progetto_id: number;
    /** Cantiere padre nello stesso progetto; non cambia mai. */
    padre_id: number | null;
    nome: string;
    slug: string;
    /** Slug del percorso dal primo livello (`a/b`): unico nel progetto, regge l'unicità tra fratelli. */
    percorso_slug: string;
    change: string;
    descrizione: string | null;
    stato: StatoCantiere;
    origine: OrigineCantiere;
    creato_il: string;
    aggiornato_il: string;
    stato_il: string;
  };
  esiti: {
    id: Generated<number>;
    cantiere_id: number;
    stato: StatoCantiere;
    ts: string;
    da: string;
  };
  legami: {
    id: Generated<number>;
    /** Il cantiere da cui è nato `a_id`, anche di un altro progetto dello stesso committente. */
    da_id: number;
    a_id: number;
    tipo: TipoLegame;
    /** Il task di partenza nel tasks.md di `da_id` (es. "1.1"). */
    task: string | null;
    session_id: string | null;
    creato_il: string;
  };
  sessioni: {
    session_id: string;
    committente_id: number;
    progetto_id: number;
    cantiere_id: number | null;
    origine_associazione: Origine | null;
    stato: StatoSessione;
    turni: number;
    titolo: string | null;
    /** Contesto per il primo prompt dopo che il cantiere ha smesso di essere aperto. */
    avviso: string | null;
    host: string;
    cwd: string;
    repo: string | null;
    branch: string | null;
    avviata_il: string;
    ultimo_evento_il: string;
    chiusa_il: string | null;
    ultimo_ts_stato: string | null;
    ultimo_ts_todo: string | null;
    /** Subagenti lanciati, contati per tipo: JSON come {"Explore": 2}. */
    subagenti: Generated<string>;
  };
  eventi: {
    id: Generated<number>;
    evento_id: string;
    ts: string;
    ricevuto_il: string;
    committente_id: number;
    session_id: string;
    progetto_id: number | null;
    cantiere_id: number | null;
    tipo: string;
    dati: string;
    codice_http: number;
    risposta: string;
  };
  stati: {
    id: Generated<number>;
    session_id: string;
    progetto_id: number;
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
  change_copie: {
    cantiere_id: number;
    /** mtime più recente tra i file del change, dal plugin. */
    modificato_il: string;
    archiviato_il: string | null;
    /** Ultima copia del progetto in cui il change compariva, attivo o archiviato. */
    visto_il: string;
    /** JSON {proposal, design, specs, tasks}: quali artefatti esistono. */
    artefatti: string;
    task_fatti: number | null;
    task_totali: number | null;
  };
  change_file: {
    cantiere_id: number;
    percorso: string;
    contenuto: string;
  };
  domande: {
    id: Generated<number>;
    /** Id scelto dal plugin: unico nella sessione. */
    domanda_id: string;
    session_id: string;
    tipo: "scelta" | "attesa";
    testo: string;
    /** JSON: lista di stringhe. */
    opzioni: string;
    host: string;
    ts: string;
    stato: "in_attesa" | "risposta" | "chiusa";
    chiusa_il: string | null;
  };
  comandi: {
    id: Generated<number>;
    committente_id: number;
    /** La sessione del comando, o quella che ha fatto la domanda; null per l'esito di un task. */
    session_id: string | null;
    /** Il cantiere di un esito: lo riceve la prima sessione del cantiere che accetta comandi (design D10). */
    cantiere_id: number | null;
    /** La domanda dell'esito (domande.id). */
    domanda_id: number | null;
    /** Il task di verifica dell'esito, con il testo del tasks.md. */
    task: string | null;
    esito: "confermato" | "negato" | null;
    /** Quel che si è scritto nella dashboard: il comando, o il feedback di un rifiuto (vuoto per una conferma). */
    testo: string;
    stato: "in_attesa" | "consegnato" | "annullato" | "scaduto";
    creato_il: string;
    consegnato_il: string | null;
  };
  idee_file: {
    cantiere_id: number;
    nome: string;
    contenuto: string;
    byte: number;
    creato_il: string;
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
