import type { Kysely } from "kysely";

// Un legame di fork porta il ritorno: chiuso il fork, la sessione che l'ha aperto torna alla partenza (fork-da-task, D1).
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("legami").addColumn("ritorno", "integer", (c) => c.notNull().defaultTo(0)).execute();
}
