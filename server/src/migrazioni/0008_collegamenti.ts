import type { Kysely } from "kysely";
import { colonnaId } from "./0001_iniziale.ts";

// Link della dashboard che collegano una cartella senza il token, e i token per macchina che ne nascono.
export async function up(db: Kysely<any>): Promise<void> {
  const id = colonnaId(db);
  await id(db.schema.createTable("collegamenti"))
    .addColumn("committente_id", "integer", (c) => c.notNull())
    .addColumn("progetto_id", "integer")
    .addColumn("cantiere_id", "integer")
    .addColumn("codice_hash", "text", (c) => c.notNull().unique())
    .addColumn("creato_il", "text", (c) => c.notNull())
    .addColumn("scade_il", "text", (c) => c.notNull())
    .addColumn("usato_il", "text")
    .execute();
  await id(db.schema.createTable("accessi"))
    .addColumn("committente_id", "integer", (c) => c.notNull())
    .addColumn("macchina", "text", (c) => c.notNull())
    .addColumn("host", "text", (c) => c.notNull())
    .addColumn("token_hash", "text", (c) => c.notNull().unique())
    .addColumn("creato_il", "text", (c) => c.notNull())
    .addUniqueConstraint("accessi_macchina", ["committente_id", "macchina"])
    .execute();
}
