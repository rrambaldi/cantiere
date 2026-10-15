import type { Kysely } from "kysely";
import type { DB } from "./db.ts";

/**
 * Di quale committente sono i dati di una richiesta. Ogni lettura di progetti, cantieri e sessioni
 * parte da questi helper, che aggiungono sempre il filtro (design D3): un test di architettura
 * fallisce se il dominio interroga quelle tabelle in un altro modo.
 */
export interface Ambito {
  /** null: amministratore (dashboard senza filtro, CLI), vede tutti i committenti. */
  committenteId: number | null;
}

export const TUTTI: Ambito = { committenteId: null };
export const di = (committenteId: number): Ambito => ({ committenteId });

export function progettiDi(db: Kysely<DB>, a: Ambito) {
  const q = db.selectFrom("progetti");
  return a.committenteId === null ? q : q.where("progetti.committente_id", "=", a.committenteId);
}

export function cantieriDi(db: Kysely<DB>, a: Ambito) {
  const q = db.selectFrom("cantieri").innerJoin("progetti", "progetti.id", "cantieri.progetto_id");
  return a.committenteId === null ? q : q.where("progetti.committente_id", "=", a.committenteId);
}

export function sessioniDi(db: Kysely<DB>, a: Ambito) {
  const q = db.selectFrom("sessioni");
  return a.committenteId === null ? q : q.where("sessioni.committente_id", "=", a.committenteId);
}
