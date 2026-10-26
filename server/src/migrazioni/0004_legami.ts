import type { Kysely } from "kysely";
import { colonnaId } from "./0001_iniziale.ts";

// Da quale cantiere è nato un cantiere, anche in un altro progetto dello stesso committente: il padre resta la fase.
export async function up(db: Kysely<any>): Promise<void> {
  await colonnaId(db)(db.schema.createTable("legami"))
    .addColumn("da_id", "integer", (c) => c.notNull())
    .addColumn("a_id", "integer", (c) => c.notNull())
    .addColumn("tipo", "text", (c) => c.notNull())
    .addColumn("task", "text")
    .addColumn("session_id", "text")
    .addColumn("creato_il", "text", (c) => c.notNull())
    .addUniqueConstraint("legami_coppia", ["da_id", "a_id"])
    .execute();
  await db.schema.createIndex("legami_a").on("legami").column("a_id").execute();
}
