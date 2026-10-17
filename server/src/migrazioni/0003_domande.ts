import type { Kysely } from "kysely";
import { colonnaId } from "./0001_iniziale.ts";

// Le domande che una sessione ha fatto all'utente: `domanda_id` è l'id scelto dal plugin.
export async function up(db: Kysely<any>): Promise<void> {
  await colonnaId(db)(db.schema.createTable("domande"))
    .addColumn("domanda_id", "text", (c) => c.notNull())
    .addColumn("session_id", "text", (c) => c.notNull())
    .addColumn("tipo", "text", (c) => c.notNull())
    .addColumn("testo", "text", (c) => c.notNull())
    .addColumn("opzioni", "text", (c) => c.notNull())
    .addColumn("host", "text", (c) => c.notNull())
    .addColumn("ts", "text", (c) => c.notNull())
    .addColumn("stato", "text", (c) => c.notNull())
    .addColumn("chiusa_il", "text")
    .addUniqueConstraint("domande_id", ["session_id", "domanda_id"])
    .execute();
  await db.schema.createIndex("domande_sessione_stato").on("domande").columns(["session_id", "stato"]).execute();
}
