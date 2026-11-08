import type { Kysely } from "kysely";
import * as z from "zod";
import { adesso, elencaCommittenti, hashToken, nuovoToken } from "./accesso.ts";
import { cantieriDi, di, progettiDi, type Ambito } from "./ambito.ts";
import type { DB } from "./db.ts";
import { percorsoDi } from "./dominio.ts";
import { errore422, luogo, Rifiuto } from "./modelli.ts";

type Db = Kysely<DB>;

/** Un link si usa entro un'ora, una volta sola: il tempo di incollarlo in Claude Code. */
export const DURATA_COLLEGAMENTO_MS = 60 * 60_000;
const NON_VALIDO = "Link non valido, già usato o scaduto: copiane uno nuovo dalla dashboard.";

const corpoCreazione = z.union([
  z.strictObject({ committente_id: z.number().int().positive() }),
  z.strictObject({ progetto_id: z.number().int().positive() }),
  z.strictObject({ cantiere_id: z.number().int().positive() }),
]);

/**
 * POST /ui/api/collegamenti dalla dashboard: un link per il committente, un suo progetto o un suo cantiere.
 * Il codice esiste in chiaro solo in questa risposta.
 */
export async function creaCollegamento(db: Db, ambito: Ambito, corpo: unknown, ora = new Date()) {
  const valido = corpoCreazione.safeParse(corpo);
  if (!valido.success) throw errore422(valido.error);
  const d = valido.data;
  let destinazione: { committente_id: number; progetto_id: number | null; cantiere_id: number | null };
  if ("cantiere_id" in d) {
    const c = await cantieriDi(db, ambito)
      .select(["cantieri.id", "cantieri.progetto_id", "cantieri.stato", "progetti.committente_id"])
      .where("cantieri.id", "=", d.cantiere_id)
      .executeTakeFirst();
    if (!c) throw new Rifiuto(404, "Cantiere inesistente.");
    if (c.stato !== "idea" && c.stato !== "aperto") throw new Rifiuto(409, `Il cantiere è ${c.stato}: il link si prende per un'idea o un cantiere aperto.`);
    destinazione = { committente_id: c.committente_id, progetto_id: c.progetto_id, cantiere_id: c.id };
  } else if ("progetto_id" in d) {
    const p = await progettiDi(db, ambito).select(["progetti.id", "progetti.committente_id"]).where("progetti.id", "=", d.progetto_id).executeTakeFirst();
    if (!p) throw new Rifiuto(404, "Progetto inesistente.");
    destinazione = { committente_id: p.committente_id, progetto_id: p.id, cantiere_id: null };
  } else {
    const visibile = ambito.committenteId === null || ambito.committenteId === d.committente_id;
    if (!visibile || !(await elencaCommittenti(db)).some((c) => c.id === d.committente_id)) throw new Rifiuto(404, "Committente inesistente.");
    destinazione = { committente_id: d.committente_id, progetto_id: null, cantiere_id: null };
  }
  const codice = nuovoToken();
  const scade_il = new Date(ora.getTime() + DURATA_COLLEGAMENTO_MS).toISOString();
  await db.insertInto("collegamenti").values({ ...destinazione, codice_hash: hashToken(codice), creato_il: ora.toISOString(), scade_il, usato_il: null }).execute();
  return { codice, scade_il };
}

/** Il link ancora buono per quel codice, o 404. */
async function valido(db: Db, codice: string) {
  const l = await db
    .selectFrom("collegamenti")
    .innerJoin("committenti", "committenti.id", "collegamenti.committente_id")
    .select(["collegamenti.id", "collegamenti.committente_id", "collegamenti.progetto_id", "collegamenti.cantiere_id", "committenti.nome as committente"])
    .where("collegamenti.codice_hash", "=", hashToken(codice))
    .where("collegamenti.usato_il", "is", null)
    .where("collegamenti.scade_il", ">", adesso())
    .executeTakeFirst();
  if (!l) throw new Rifiuto(404, NON_VALIDO);
  return l;
}

/** Committente, progetto e cantiere del link, per nome: quel che il plugin mostra e salva. */
async function destinazione(db: Db, l: Awaited<ReturnType<typeof valido>>) {
  const ambito = di(l.committente_id);
  const progetto = l.progetto_id === null ? undefined : await progettiDi(db, ambito).select("progetti.nome").where("progetti.id", "=", l.progetto_id).executeTakeFirst();
  const cantiere = l.cantiere_id === null ? undefined : await cantieriDi(db, ambito).select("cantieri.id").where("cantieri.id", "=", l.cantiere_id).executeTakeFirst();
  return {
    committente: l.committente,
    progetto: progetto?.nome ?? null,
    cantiere: cantiere ? { id: cantiere.id, percorso: await percorsoDi(db, cantiere.id) } : null,
  };
}

// Il codice viaggia nel corpo, mai nell'indirizzo: così non finisce nei log del proxy.
const codice = z.string().min(1).max(128);
const corpoLettura = z.strictObject({ codice });

/** POST /api/v1/collegamenti/leggi, senza token: dove porta il link, senza usarlo. */
export async function leggiCollegamento(db: Db, corpo: unknown) {
  const v = corpoLettura.safeParse(corpo);
  if (!v.success) throw errore422(v.error);
  const l = await valido(db, v.data.codice);
  const progetti = await progettiDi(db, di(l.committente_id)).select("progetti.nome").orderBy("progetti.slug").execute();
  return { ...(await destinazione(db, l)), progetti: progetti.map((p) => p.nome) };
}

const corpoScambio = z.strictObject({ codice, macchina: z.string().trim().min(1).max(128), host: luogo.shape.host });

/**
 * POST /api/v1/collegamenti/usa, senza token: il link si consuma e la macchina riceve il suo token.
 * Un token per macchina e committente: uno scambio nuovo dalla stessa macchina sostituisce il precedente.
 */
export async function usaCollegamento(db: Db, corpo: unknown) {
  const v = corpoScambio.safeParse(corpo);
  if (!v.success) throw errore422(v.error);
  const l = await valido(db, v.data.codice);
  const token = nuovoToken();
  await db.transaction().execute(async (trx) => {
    const ora = adesso();
    // Due scambi insieme con lo stesso codice: passa solo il primo.
    const r = await trx.updateTable("collegamenti").set({ usato_il: ora }).where("id", "=", l.id).where("usato_il", "is", null).executeTakeFirst();
    if (!r.numUpdatedRows) throw new Rifiuto(404, NON_VALIDO);
    await trx.deleteFrom("accessi").where("committente_id", "=", l.committente_id).where("macchina", "=", v.data.macchina).execute();
    await trx
      .insertInto("accessi")
      .values({ committente_id: l.committente_id, macchina: v.data.macchina, host: v.data.host, token_hash: hashToken(token), creato_il: ora })
      .execute();
  });
  return { token, ...(await destinazione(db, l)) };
}

/** I link scaduti, usati o no: dopo un'ora non servono più. */
export async function puliziaCollegamenti(db: Db): Promise<number> {
  return Number((await db.deleteFrom("collegamenti").where("scade_il", "<", adesso()).executeTakeFirst()).numDeletedRows);
}
