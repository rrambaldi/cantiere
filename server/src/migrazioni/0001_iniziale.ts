import { PostgresAdapter, type CreateTableBuilder, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // SQLite: "integer primary key" è l'alias del rowid; PostgreSQL vuole serial.
  const pg = db.getExecutor().adapter instanceof PostgresAdapter;
  const id = <T extends string>(t: CreateTableBuilder<T>) =>
    pg ? t.addColumn("id", "serial", (c) => c.primaryKey()) : t.addColumn("id", "integer", (c) => c.primaryKey().autoIncrement());

  await id(db.schema.createTable("clienti"))
    .addColumn("nome", "text", (c) => c.notNull())
    .addColumn("token_hash", "text", (c) => c.notNull().unique())
    .addColumn("creato_il", "text", (c) => c.notNull())
    .addColumn("revocato_il", "text")
    .execute();

  await id(db.schema.createTable("cantieri"))
    .addColumn("padre_id", "integer")
    .addColumn("nome", "text", (c) => c.notNull())
    .addColumn("slug", "text", (c) => c.notNull())
    .addColumn("slug_aperto", "text", (c) => c.unique())
    .addColumn("descrizione", "text")
    .addColumn("origine", "text", (c) => c.notNull())
    .addColumn("stato", "text", (c) => c.notNull())
    .addColumn("esito", "text")
    .addColumn("nota", "text")
    .addColumn("repo", "text")
    .addColumn("branch", "text")
    .addColumn("creato_il", "text", (c) => c.notNull())
    .addColumn("aggiornato_il", "text", (c) => c.notNull())
    .addColumn("chiuso_il", "text")
    .execute();

  await db.schema
    .createTable("sessioni")
    .addColumn("session_id", "text", (c) => c.primaryKey())
    .addColumn("cliente_id", "integer", (c) => c.notNull())
    .addColumn("host", "text", (c) => c.notNull())
    .addColumn("cwd", "text", (c) => c.notNull())
    .addColumn("repo", "text")
    .addColumn("branch", "text")
    .addColumn("cantiere_id", "integer")
    .addColumn("origine_associazione", "text")
    .addColumn("confermato", "integer", (c) => c.notNull())
    .addColumn("stato", "text", (c) => c.notNull())
    .addColumn("turni", "integer", (c) => c.notNull())
    .addColumn("hint_inviati", "integer", (c) => c.notNull())
    .addColumn("avviata_il", "text", (c) => c.notNull())
    .addColumn("ultimo_evento_il", "text", (c) => c.notNull())
    .addColumn("chiusa_il", "text")
    .addColumn("ultimo_ts_stato", "text")
    .addColumn("ultimo_ts_todo", "text")
    .execute();
  await db.schema.createIndex("sessioni_cantiere").on("sessioni").column("cantiere_id").execute();

  await id(db.schema.createTable("eventi"))
    .addColumn("evento_id", "text", (c) => c.notNull().unique())
    .addColumn("ts", "text", (c) => c.notNull())
    .addColumn("ricevuto_il", "text", (c) => c.notNull())
    .addColumn("cliente_id", "integer", (c) => c.notNull())
    .addColumn("session_id", "text", (c) => c.notNull())
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
    .addColumn("cantiere_id", "integer")
    .addColumn("ts", "text", (c) => c.notNull())
    .addColumn("fatto", "text", (c) => c.notNull())
    .addColumn("prossimo", "text", (c) => c.notNull())
    .addColumn("bloccato_da", "text")
    .addColumn("percentuale", "integer")
    .execute();
  await db.schema.createIndex("stati_sessione").on("stati").column("session_id").execute();

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
}
