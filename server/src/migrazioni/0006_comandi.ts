import type { Kysely } from "kysely";
import { colonnaId } from "./0001_iniziale.ts";

// Comandi dalla dashboard alle sessioni, ed esiti di domande e verifiche: un esito di un cantiere non ha sessione.
export async function up(db: Kysely<any>): Promise<void> {
  await colonnaId(db)(db.schema.createTable("comandi"))
    .addColumn("committente_id", "integer", (c) => c.notNull())
    .addColumn("session_id", "text")
    .addColumn("cantiere_id", "integer")
    .addColumn("domanda_id", "integer")
    .addColumn("task", "text")
    .addColumn("esito", "text")
    .addColumn("testo", "text", (c) => c.notNull())
    .addColumn("stato", "text", (c) => c.notNull())
    .addColumn("creato_il", "text", (c) => c.notNull())
    .addColumn("consegnato_il", "text")
    .execute();
  await db.schema.createIndex("comandi_sessione_stato").on("comandi").columns(["session_id", "stato"]).execute();
  await db.schema.createIndex("comandi_cantiere_stato").on("comandi").columns(["cantiere_id", "stato"]).execute();
}
