import type { Insertable, Kysely, Selectable, Transaction } from "kysely";
import * as z from "zod";
import { adesso } from "./accesso.ts";
import { cantieriDi, comandiDi, sessioniDi, type Ambito } from "./ambito.ts";
import { esitoDomanda, esitoTask } from "./contesto.ts";
import type { DB } from "./db.ts";
import { rispondiDomanda, SCADENZA_DOMANDE_MS } from "./domande.ts";
import type { Ambiente } from "./dominio.ts";
import { contaTask, errore422, Rifiuto } from "./modelli.ts";

type Db = Kysely<DB> | Transaction<DB>;
type Comando = Selectable<DB["comandi"]>;

/** Un comando non consegnato entro così scade; l'esito di un cantiere no (design D6, D10). */
export const SCADENZA_COMANDI_MS = 24 * 3_600_000;
const MAX_IN_ATTESA = 5;

const testo = z.string().trim().min(1).max(500);
const schemaEsito = z.discriminatedUnion("esito", [
  z.object({ esito: z.literal("confermato") }),
  z.object({ esito: z.literal("negato"), feedback: testo }),
]);

function valida<S extends z.ZodType>(schema: S, dato: unknown): z.infer<S> {
  const v = schema.safeParse(dato);
  if (!v.success) throw errore422(v.error);
  return v.data;
}

const limite = (ora = Date.now()) => new Date(ora - SCADENZA_COMANDI_MS).toISOString();

/** Scaduto si vede subito, anche prima che una consegna lo scriva. */
const statoVisibile = (c: Pick<Comando, "stato" | "cantiere_id" | "creato_il">) => (c.stato === "in_attesa" && c.cantiere_id === null && c.creato_il < limite() ? "scaduto" : c.stato);

/** Un comando come lo vede la dashboard. */
const forma = ({ committente_id, domanda_id, ...c }: Comando) => ({ ...c, stato: statoVisibile(c) });

const nuovo = (trx: Db, c: Partial<Insertable<DB["comandi"]>> & Pick<Comando, "committente_id" | "testo">) =>
  trx
    .insertInto("comandi")
    .values({ session_id: null, cantiere_id: null, domanda_id: null, task: null, esito: null, stato: "in_attesa", creato_il: adesso(), consegnato_il: null, ...c })
    .returningAll()
    .executeTakeFirstOrThrow();

/** Comando di testo per una sessione non chiusa dell'ambito (design D7). */
export async function creaComando(amb: Ambiente, ambito: Ambito, corpo: { session_id?: unknown; testo?: unknown }) {
  const scritto = valida(testo, corpo.testo);
  const s = await sessioniDi(amb.db, ambito)
    .select(["session_id", "committente_id", "stato"])
    .where("session_id", "=", String(corpo.session_id ?? ""))
    .executeTakeFirst();
  if (!s) throw new Rifiuto(404, "Sessione inesistente.");
  if (s.stato === "chiusa") throw new Rifiuto(409, "La sessione è chiusa.");
  return amb.db.transaction().execute(async (trx) => {
    const { n } = await trx
      .selectFrom("comandi")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .where("session_id", "=", s.session_id)
      .where("esito", "is", null)
      .where("stato", "=", "in_attesa")
      .where("creato_il", ">=", limite())
      .executeTakeFirstOrThrow();
    if (Number(n) >= MAX_IN_ATTESA) throw new Rifiuto(409, `La sessione ha già ${MAX_IN_ATTESA} comandi in attesa.`);
    return forma(await nuovo(trx, { committente_id: s.committente_id, session_id: s.session_id, testo: scritto }));
  });
}

/** Si annulla solo un comando ancora in attesa: lo stato si ricontrolla nella scrittura, perché la consegna può arrivare prima. */
export async function annullaComando(amb: Ambiente, ambito: Ambito, id: number) {
  const c = await comandiDi(amb.db, ambito).selectAll().where("id", "=", id).executeTakeFirst();
  if (!c) throw new Rifiuto(404, "Comando inesistente.");
  const r = statoVisibile(c) === "in_attesa"
    ? await amb.db.updateTable("comandi").set({ stato: "annullato" }).where("id", "=", id).where("stato", "=", "in_attesa").executeTakeFirst()
    : null;
  if (!r?.numUpdatedRows) throw new Rifiuto(409, "Il comando non è più in attesa: non si annulla.");
  return forma({ ...c, stato: "annullato" });
}

const feedbackDi = (e: z.infer<typeof schemaEsito>) => (e.esito === "negato" ? e.feedback : "");

/** «Confermo» o «Non va» su una domanda in attesa: la chiude come risposta e ne fa un comando (design D8). */
export async function esitoSuDomanda(amb: Ambiente, ambito: Ambito, corpo: { session_id?: unknown; domanda_id?: unknown }) {
  const e = valida(schemaEsito, corpo);
  const d = await sessioniDi(amb.db, ambito)
    .innerJoin("domande", "domande.session_id", "sessioni.session_id")
    .select(["domande.id", "domande.domanda_id", "domande.ts", "sessioni.session_id", "sessioni.committente_id", "sessioni.cantiere_id"])
    .where("sessioni.session_id", "=", String(corpo.session_id ?? ""))
    .where("domande.domanda_id", "=", String(corpo.domanda_id ?? ""))
    .executeTakeFirst();
  if (!d) throw new Rifiuto(404, "Domanda inesistente.");
  return amb.db.transaction().execute(async (trx) => {
    // Chiusa o scaduta nel frattempo: non c'è più niente da confermare.
    const scaduta = d.ts < new Date(Date.now() - SCADENZA_DOMANDE_MS).toISOString();
    const [r] = scaduta ? [] : await rispondiDomanda(trx, d.session_id, d.domanda_id, adesso());
    if (!r?.numUpdatedRows) throw new Rifiuto(409, "La domanda non è più in attesa.");
    return forma(
      await nuovo(trx, { committente_id: d.committente_id, session_id: d.session_id, cantiere_id: d.cantiere_id, domanda_id: d.id, esito: e.esito, testo: feedbackDi(e) }),
    );
  });
}

/** Un task di verifica comincia con «Verificare» o «Prova», dopo il suo numero (design D9). */
const diVerifica = (task: string) => /^(\d+(\.\d+)*\.?\s+)?(verificare|prova)\b/i.test(task);

/** I task di verifica aperti nella copia del tasks.md del cantiere. */
export async function taskDiVerifica(db: Db, cantiereId: number) {
  const tasks = await db.selectFrom("change_file").select("contenuto").where("cantiere_id", "=", cantiereId).where("percorso", "=", "tasks.md").executeTakeFirst();
  return tasks ? contaTask(tasks.contenuto).aperti.filter(diVerifica) : [];
}

/** «Confermo» o «Non va» su un task di verifica: un esito del cantiere, anche senza sessioni aperte (design D9, D10). */
export async function esitoSuTask(amb: Ambiente, ambito: Ambito, cantiereId: number, corpo: { task?: unknown }) {
  const e = valida(schemaEsito, corpo);
  const c = await cantieriDi(amb.db, ambito).select(["cantieri.id", "progetti.committente_id"]).where("cantieri.id", "=", cantiereId).executeTakeFirst();
  if (!c) throw new Rifiuto(404, "Cantiere inesistente.");
  const task = String(corpo.task ?? "");
  if (!(await taskDiVerifica(amb.db, c.id)).includes(task)) throw new Rifiuto(409, "Non è un task di verifica aperto.");
  return amb.db.transaction().execute(async (trx) => {
    // Il nuovo esito prende il posto di quello sullo stesso task non ancora consegnato.
    await trx.updateTable("comandi").set({ stato: "annullato" }).where("cantiere_id", "=", c.id).where("task", "=", task).where("stato", "=", "in_attesa").execute();
    return forma(await nuovo(trx, { committente_id: c.committente_id, cantiere_id: c.id, task, esito: e.esito, testo: feedbackDi(e) }));
  });
}

/**
 * Consegna a una sessione che accetta comandi i suoi comandi non scaduti e gli esiti del suo cantiere, dal più
 * vecchio. Un UPDATE solo li prende e li segna `consegnato`: due eventi insieme non ricevono lo stesso comando,
 * anche su PostgreSQL (design D2, D10).
 */
export async function consegna(trx: Transaction<DB>, s: { session_id: string; committente_id: number; cantiere_id: number | null }, ora: string) {
  await trx
    .updateTable("comandi")
    .set({ stato: "scaduto" })
    .where("session_id", "=", s.session_id)
    .where("cantiere_id", "is", null)
    .where("stato", "=", "in_attesa")
    .where("creato_il", "<", limite(Date.parse(ora)))
    .execute();
  const presi = await trx
    .updateTable("comandi")
    .set({ stato: "consegnato", consegnato_il: ora })
    .where("committente_id", "=", s.committente_id)
    .where("stato", "=", "in_attesa")
    .where((eb) =>
      eb.or([
        eb.and([eb("cantiere_id", "is", null), eb("session_id", "=", s.session_id)]),
        ...(s.cantiere_id === null ? [] : [eb("cantiere_id", "=", s.cantiere_id)]),
      ]),
    )
    .returning(["id", "session_id", "task", "esito", "testo", "domanda_id"])
    .execute();
  const ids = presi.flatMap((r) => (r.domanda_id === null ? [] : [r.domanda_id]));
  const domande = new Map((ids.length ? await trx.selectFrom("domande").select(["id", "testo", "host"]).where("id", "in", ids).execute() : []).map((d) => [d.id, d]));
  return presi
    .sort((a, b) => a.id - b.id)
    .map((r) => {
      const d = r.domanda_id === null ? undefined : domande.get(r.domanda_id);
      return {
        id: r.id,
        testo:
          r.esito === null ? r.testo
          : r.task !== null ? esitoTask(r.task, r.esito, r.testo)
          : esitoDomanda(d?.testo ?? "", `sessione ${r.session_id?.slice(0, 8)} su ${d?.host}`, r.esito, r.testo),
      };
    });
}

/** Comandi delle sessioni ed esiti del cantiere indicati, per la dashboard, dal più recente. */
export async function leggiComandi(db: Kysely<DB>, ambito: Ambito, { sessioni, cantiere }: { sessioni: string[]; cantiere?: number }) {
  if (!sessioni.length && cantiere === undefined) return [];
  const righe = await comandiDi(db, ambito)
    .selectAll()
    .where((eb) => eb.or([...(sessioni.length ? [eb("session_id", "in", sessioni)] : []), ...(cantiere === undefined ? [] : [eb("cantiere_id", "=", cantiere)])]))
    .orderBy("id", "desc")
    .execute();
  return righe.map(forma);
}

export async function puliziaComandi(db: Db, limite: string): Promise<number> {
  const r = await db.deleteFrom("comandi").where("creato_il", "<", limite).executeTakeFirst();
  return Number(r.numDeletedRows);
}
