import type { Kysely } from "kysely";

// Quanti subagenti ha lanciato una sessione, per tipo, come oggetto JSON: mai prompt né descrizioni.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("sessioni").addColumn("subagenti", "text", (c) => c.notNull().defaultTo("{}")).execute();
}
