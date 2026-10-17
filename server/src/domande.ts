import type { Kysely, Transaction } from "kysely";
import { sessioniDi, type Ambito } from "./ambito.ts";
import type { DB } from "./db.ts";

type Db = Kysely<DB> | Transaction<DB>;

/** Una domanda in attesa da più di così non si mostra più (design D4). */
export const SCADENZA_DOMANDE_MS = 24 * 3_600_000;

export interface NuovaDomanda {
  id: string;
  tipo: "scelta" | "attesa";
  testo: string;
  opzioni: string[];
}

/** Una domanda con lo stesso id nella stessa sessione si registra una volta sola. */
export async function registraDomanda(trx: Db, sessionId: string, d: NuovaDomanda, host: string, ts: string) {
  const esiste = await trx.selectFrom("domande").select("id").where("session_id", "=", sessionId).where("domanda_id", "=", d.id).executeTakeFirst();
  if (esiste) return;
  await trx
    .insertInto("domande")
    .values({ domanda_id: d.id, session_id: sessionId, tipo: d.tipo, testo: d.testo, opzioni: JSON.stringify(d.opzioni), host, ts, stato: "in_attesa", chiusa_il: null })
    .execute();
}

/** Segna `risposta` la domanda dell'evento; un id sconosciuto non cambia nulla. */
export function rispondiDomanda(trx: Db, sessionId: string, domandaId: string, ts: string) {
  return trx
    .updateTable("domande")
    .set({ stato: "risposta", chiusa_il: ts })
    .where("session_id", "=", sessionId)
    .where("domanda_id", "=", domandaId)
    .where("stato", "=", "in_attesa")
    .execute();
}

/**
 * Chiude le domande ancora in attesa fatte non dopo `ts`: un evento arrivato in ritardo non chiude
 * una domanda nata dopo di lui. `solo` limita ai tipi indicati.
 */
export function chiudiDomande(trx: Db, sessionId: string, ts: string, solo?: NuovaDomanda["tipo"]) {
  let q = trx
    .updateTable("domande")
    .set({ stato: "chiusa", chiusa_il: ts })
    .where("session_id", "=", sessionId)
    .where("stato", "=", "in_attesa")
    .where("ts", "<=", ts);
  if (solo) q = q.where("tipo", "=", solo);
  return q.execute();
}

export interface DomandaInAttesa {
  id: string;
  session_id: string;
  tipo: "scelta" | "attesa";
  testo: string;
  opzioni: string[];
  host: string;
  ts: string;
  eta_secondi: number;
}

/** Domande in attesa e non scadute dell'ambito, con il cantiere e il progetto della loro sessione. */
export async function domandeInAttesa(db: Db, ambito: Ambito, ora = Date.now()) {
  const limite = new Date(ora - SCADENZA_DOMANDE_MS).toISOString();
  const righe = await sessioniDi(db, ambito)
    .innerJoin("domande", "domande.session_id", "sessioni.session_id")
    .select(["domande.domanda_id", "domande.session_id", "domande.tipo", "domande.testo", "domande.opzioni", "domande.host", "domande.ts", "sessioni.cantiere_id", "sessioni.progetto_id"])
    .where("domande.stato", "=", "in_attesa")
    .where("domande.ts", ">=", limite)
    .orderBy("domande.ts")
    .execute();
  return righe.map(({ domanda_id, opzioni, tipo, cantiere_id, progetto_id, ...r }) => ({
    cantiere_id,
    progetto_id,
    domanda: { ...r, id: domanda_id, tipo: tipo as DomandaInAttesa["tipo"], opzioni: JSON.parse(opzioni) as string[], eta_secondi: Math.max(0, Math.round((ora - Date.parse(r.ts)) / 1000)) } satisfies DomandaInAttesa,
  }));
}

/** Toglie le domande vecchie di `retention`, chiuse o no. */
export async function puliziaDomande(db: Db, limite: string): Promise<number> {
  const r = await db.deleteFrom("domande").where("ts", "<", limite).executeTakeFirst();
  return Number(r.numDeletedRows);
}
