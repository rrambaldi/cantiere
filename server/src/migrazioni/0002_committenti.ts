import type { Kysely } from "kysely";
import { colonnaId } from "./0001_iniziale.ts";

// v1 non è mai andato in produzione: si riparte da tabelle vuote (design D2).
export async function up(db: Kysely<any>): Promise<void> {
  const id = colonnaId(db);
  for (const t of ["clienti", "cantieri", "sessioni", "eventi", "stati", "todo"]) await db.schema.dropTable(t).execute();

  await id(db.schema.createTable("committenti"))
    .addColumn("nome", "text", (c) => c.notNull())
    .addColumn("nome_chiave", "text", (c) => c.notNull().unique())
    .addColumn("token_hash", "text", (c) => c.notNull().unique())
    .addColumn("token_il", "text", (c) => c.notNull())
    .addColumn("creato_il", "text", (c) => c.notNull())
    .execute();

  await id(db.schema.createTable("progetti"))
    .addColumn("committente_id", "integer", (c) => c.notNull())
    .addColumn("nome", "text", (c) => c.notNull())
    .addColumn("slug", "text", (c) => c.notNull())
    .addColumn("creato_il", "text", (c) => c.notNull())
    .addColumn("openspec_il", "text")
    .addUniqueConstraint("progetti_slug", ["committente_id", "slug"])
    .execute();

  await id(db.schema.createTable("cantieri"))
    .addColumn("progetto_id", "integer", (c) => c.notNull())
    .addColumn("padre_id", "integer")
    .addColumn("nome", "text", (c) => c.notNull())
    .addColumn("slug", "text", (c) => c.notNull())
    .addColumn("percorso_slug", "text", (c) => c.notNull())
    .addColumn("change", "text", (c) => c.notNull())
    .addColumn("descrizione", "text")
    .addColumn("stato", "text", (c) => c.notNull())
    .addColumn("origine", "text", (c) => c.notNull())
    .addColumn("creato_il", "text", (c) => c.notNull())
    .addColumn("aggiornato_il", "text", (c) => c.notNull())
    .addColumn("stato_il", "text", (c) => c.notNull())
    .addUniqueConstraint("cantieri_percorso", ["progetto_id", "percorso_slug"])
    .addUniqueConstraint("cantieri_change", ["progetto_id", "change"])
    .execute();

  await id(db.schema.createTable("esiti"))
    .addColumn("cantiere_id", "integer", (c) => c.notNull())
    .addColumn("stato", "text", (c) => c.notNull())
    .addColumn("ts", "text", (c) => c.notNull())
    .addColumn("da", "text", (c) => c.notNull())
    .execute();
  await db.schema.createIndex("esiti_cantiere").on("esiti").column("cantiere_id").execute();

  await db.schema
    .createTable("sessioni")
    .addColumn("session_id", "text", (c) => c.primaryKey())
    .addColumn("committente_id", "integer", (c) => c.notNull())
    .addColumn("progetto_id", "integer", (c) => c.notNull())
    .addColumn("cantiere_id", "integer")
    .addColumn("origine_associazione", "text")
    .addColumn("stato", "text", (c) => c.notNull())
    .addColumn("turni", "integer", (c) => c.notNull())
    .addColumn("titolo", "text")
    .addColumn("avviso", "text")
    .addColumn("host", "text", (c) => c.notNull())
    .addColumn("cwd", "text", (c) => c.notNull())
    .addColumn("repo", "text")
    .addColumn("branch", "text")
    .addColumn("avviata_il", "text", (c) => c.notNull())
    .addColumn("ultimo_evento_il", "text", (c) => c.notNull())
    .addColumn("chiusa_il", "text")
    .addColumn("ultimo_ts_stato", "text")
    .addColumn("ultimo_ts_todo", "text")
    .execute();
  await db.schema.createIndex("sessioni_cantiere").on("sessioni").column("cantiere_id").execute();
  await db.schema.createIndex("sessioni_progetto").on("sessioni").column("progetto_id").execute();

  await id(db.schema.createTable("eventi"))
    .addColumn("evento_id", "text", (c) => c.notNull().unique())
    .addColumn("ts", "text", (c) => c.notNull())
    .addColumn("ricevuto_il", "text", (c) => c.notNull())
    .addColumn("committente_id", "integer", (c) => c.notNull())
    .addColumn("session_id", "text", (c) => c.notNull())
    .addColumn("progetto_id", "integer")
    .addColumn("cantiere_id", "integer")
    .addColumn("tipo", "text", (c) => c.notNull())
    .addColumn("dati", "text", (c) => c.notNull())
    .addColumn("codice_http", "integer", (c) => c.notNull())
    .addColumn("risposta", "text", (c) => c.notNull())
    .execute();
  await db.schema.createIndex("eventi_sessione").on("eventi").column("session_id").execute();
  await db.schema.createIndex("eventi_ricevuto").on("eventi").column("ricevuto_il").execute();

  await id(db.schema.createTable("stati"))
    .addColumn("session_id", "text", (c) => c.notNull())
    .addColumn("progetto_id", "integer", (c) => c.notNull())
    .addColumn("cantiere_id", "integer")
    .addColumn("ts", "text", (c) => c.notNull())
    .addColumn("fatto", "text", (c) => c.notNull())
    .addColumn("prossimo", "text", (c) => c.notNull())
    .addColumn("bloccato_da", "text")
    .addColumn("percentuale", "integer")
    .execute();
  await db.schema.createIndex("stati_sessione").on("stati").column("session_id").execute();
  await db.schema.createIndex("stati_cantiere").on("stati").column("cantiere_id").execute();

  await db.schema
    .createTable("todo")
    .addColumn("session_id", "text", (c) => c.notNull())
    .addColumn("chiave", "text", (c) => c.notNull())
    .addColumn("testo", "text", (c) => c.notNull())
    .addColumn("stato", "text", (c) => c.notNull())
    .addColumn("ordine", "integer", (c) => c.notNull())
    .addColumn("aggiornato_il", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("todo_pk", ["session_id", "chiave"])
    .execute();

  await db.schema
    .createTable("change_copie")
    .addColumn("cantiere_id", "integer", (c) => c.primaryKey())
    .addColumn("modificato_il", "text", (c) => c.notNull())
    .addColumn("archiviato_il", "text")
    .addColumn("visto_il", "text", (c) => c.notNull())
    .addColumn("artefatti", "text", (c) => c.notNull())
    .addColumn("task_fatti", "integer")
    .addColumn("task_totali", "integer")
    .execute();

  await db.schema
    .createTable("change_file")
    .addColumn("cantiere_id", "integer", (c) => c.notNull())
    .addColumn("percorso", "text", (c) => c.notNull())
    .addColumn("contenuto", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("change_file_pk", ["cantiere_id", "percorso"])
    .execute();

  await db.schema
    .createTable("idee_file")
    .addColumn("cantiere_id", "integer", (c) => c.notNull())
    .addColumn("nome", "text", (c) => c.notNull())
    .addColumn("contenuto", "text", (c) => c.notNull())
    .addColumn("byte", "integer", (c) => c.notNull())
    .addColumn("creato_il", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("idee_file_pk", ["cantiere_id", "nome"])
    .execute();
}
