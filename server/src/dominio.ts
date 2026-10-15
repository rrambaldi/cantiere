import type { Kysely, Selectable, Transaction } from "kysely";
import { adesso, type Committente } from "./accesso.ts";
import { cantieriDi, di, progettiDi, sessioniDi, TUTTI, type Ambito } from "./ambito.ts";
import type { Config } from "./config.ts";
import * as testi from "./contesto.ts";
import type { CantiereRisposta } from "./contesto.ts";
import { violaUnicita, type DB } from "./db.ts";
import {
  campi,
  errore422,
  nomeChange,
  Rifiuto,
  segmenti,
  slugifica,
  STATI_FINALI,
  type Evento,
  type Luogo,
  type Origine,
  type OrigineCantiere,
  type StatoCantiere,
  type StatoSessione,
} from "./modelli.ts";

export interface Ambiente {
  db: Kysely<DB>;
  config: Config;
}

export interface Risposta {
  progetto: string;
  cantiere: CantiereRisposta | null;
  contesto: string | null;
  config: Pick<Config, "modalita_resoconto" | "soglia_strumenti">;
}

export type Esito = { codice: 200; risposta: Risposta } | { codice: 409 | 422; risposta: { errore: string } };

type Db = Kysely<DB> | Transaction<DB>;
type Sessione = Selectable<DB["sessioni"]>;
type Cantiere = Selectable<DB["cantieri"]>;
type Progetto = Selectable<DB["progetti"]>;

export const RIFIUTO_PRECEDENZA =
  "Il cantiere di questa sessione l'ha scelto l'utente: solo l'utente può cambiarlo. Non riprovare.";
const SERVE_PROGETTO = "Questa sessione non è ancora legata a un progetto: indica il progetto.";
const comePrendere = (percorso: string) => `"${percorso}" è un'idea: per lavorarci usa /cantiere prendi ${percorso}.`;
export const nonApribile = (percorso: string, stato: StatoCantiere) =>
  stato === "sospeso"
    ? `Il cantiere "${percorso}" è sospeso: si riattiva dalla dashboard.`
    : `Il cantiere "${percorso}" è ${stato}: un cantiere chiuso non si riapre. Scegli un altro nome.`;
const changePreso = (change: string, percorso: string) => `Il change "${change}" è già del cantiere "${percorso}": scegli un altro nome.`;

// Sessione creata da un client senza hook (MCP): host e cwd non si conoscono.
const LUOGO_MCP: Luogo = { host: "mcp", cwd: "", repo: null, branch: null };

// --- Progetti -----------------------------------------------------------------------------------

export const progettoPerNome = (db: Db, ambito: Ambito, nome: string) =>
  progettiDi(db, ambito).selectAll("progetti").where("progetti.slug", "=", slugifica(nome)).executeTakeFirst();

/** Crea un progetto sotto il committente: solo su richiesta esplicita (dashboard o API). */
export async function creaProgetto(db: Kysely<DB>, committenteId: number, nome: string): Promise<Progetto> {
  const valido = campi.nomeSemplice.safeParse(nome);
  if (!valido.success) throw errore422(valido.error);
  const esistente = await progettoPerNome(db, di(committenteId), valido.data);
  const giaUsato = () => new Rifiuto(409, `Il progetto "${esistente?.nome ?? valido.data}" esiste già.`);
  if (esistente) throw giaUsato();
  try {
    return await db
      .insertInto("progetti")
      .values({ committente_id: committenteId, nome: valido.data, slug: slugifica(valido.data), creato_il: adesso(), openspec_il: null })
      .returningAll()
      .executeTakeFirstOrThrow();
  } catch (errore) {
    if (violaUnicita(errore)) throw giaUsato();
    throw errore;
  }
}

/** Progetti dell'ambito con il numero di cantieri per stato. */
export async function elencaProgetti(db: Kysely<DB>, ambito: Ambito) {
  const progetti = await progettiDi(db, ambito).selectAll("progetti").orderBy("progetti.slug").execute();
  const cantieri = await cantieriDi(db, ambito).select(["cantieri.progetto_id", "cantieri.stato"]).execute();
  return progetti.map(({ openspec_il, committente_id, ...p }) => {
    const conteggi = { idea: 0, aperto: 0, sospeso: 0, completato: 0, abbandonato: 0 };
    for (const c of cantieri) if (c.progetto_id === p.id) conteggi[c.stato]++;
    return { ...p, cantieri: conteggi };
  });
}

export const formaProgetto = ({ openspec_il, committente_id, ...p }: Progetto) => ({
  ...p,
  cantieri: { idea: 0, aperto: 0, sospeso: 0, completato: 0, abbandonato: 0 },
});

// --- Eventi -------------------------------------------------------------------------------------

/**
 * Applica un evento in modo idempotente: lo stesso evento_id restituisce la risposta salvata la
 * prima volta, senza riapplicare effetti. luogo è null per gli eventi interni dei tool MCP.
 */
export async function riceviEvento(amb: Ambiente, committente: Committente, ev: Evento, luogo: Luogo | null): Promise<Esito> {
  const progetto = await progettoPerNome(amb.db, di(committente.id), ev.progetto);
  if (!progetto) return { codice: 422, risposta: { errore: `Il progetto "${ev.progetto}" non esiste.` } };
  try {
    return await amb.db.transaction().execute(async (trx) => {
      const ora = adesso();
      await trx
        .insertInto("eventi")
        .values({
          evento_id: ev.evento_id,
          ts: ev.ts,
          ricevuto_il: ora,
          committente_id: committente.id,
          session_id: ev.session_id,
          progetto_id: progetto.id,
          cantiere_id: null,
          tipo: ev.tipo,
          dati: JSON.stringify(ev.dati),
          codice_http: 0,
          risposta: "",
        })
        .execute();
      const [esito, cantiereId] = await applica(trx, amb.config, committente, progetto, ev, luogo, ora);
      await trx
        .updateTable("eventi")
        .set({ codice_http: esito.codice, risposta: JSON.stringify(esito.risposta), cantiere_id: cantiereId })
        .where("evento_id", "=", ev.evento_id)
        .execute();
      return esito;
    });
  } catch (errore) {
    // Un rifiuto annulla la transazione: l'evento non resta salvato.
    if (errore instanceof Rifiuto) return { codice: 422, risposta: { errore: errore.message } };
    if (!violaUnicita(errore)) throw errore;
    const salvato = await amb.db
      .selectFrom("eventi")
      .select(["codice_http", "risposta", "committente_id"])
      .where("evento_id", "=", ev.evento_id)
      .executeTakeFirstOrThrow();
    // Un evento_id di un altro committente non rivela nulla della sua risposta.
    if (salvato.committente_id !== committente.id) return { codice: 422, risposta: { errore: "evento_id già usato." } };
    return { codice: salvato.codice_http, risposta: JSON.parse(salvato.risposta) } as Esito;
  }
}

async function applica(
  trx: Transaction<DB>,
  config: Config,
  committente: Committente,
  progetto: Progetto,
  ev: Evento,
  luogo: Luogo | null,
  ora: string,
): Promise<[Esito, number | null]> {
  let s = await sessione(trx, committente.id, ev.session_id, progetto.id, luogo, ora);
  let contesto: string | null = null;
  const rifiuto = (errore: string): [Esito, number | null] => [{ codice: 409, risposta: { errore } }, s.cantiere_id];

  switch (ev.tipo) {
    case "apri_cantiere": {
      if (s.cantiere_id !== null && s.origine_associazione === "utente" && ev.dati.origine === "claude") return rifiuto(RIFIUTO_PRECEDENZA);
      const nomi = [...(ev.dati.padre ? segmenti(ev.dati.padre) : []), ...segmenti(ev.dati.nome)];
      const c = await apriPercorso(trx, progetto.id, nomi, ev.dati.descrizione ?? null, ev.dati.origine, ora);
      if (typeof c === "string") return rifiuto(c);
      s = await associa(trx, s.session_id, c.id, ev.dati.origine);
      contesto = testi.confermaApertura(await percorsoDi(trx, c.id), c.change);
      break;
    }
    case "session_start":
      await transizione(trx, s, "attiva", ev.ts);
      contesto = await contestoAvvio(trx, config, committente, progetto, s);
      break;
    case "prompt":
      await trx
        .updateTable("sessioni")
        .set((eb) => ({ turni: eb("turni", "+", 1), avviso: null }))
        .where("session_id", "=", s.session_id)
        .execute();
      await transizione(trx, s, "lavorando", ev.ts);
      contesto = s.avviso;
      break;
    case "todo":
      await applicaTodo(trx, s, ev.ts, ev.dati.completo, ev.dati.todos);
      break;
    case "stop":
    case "session_end":
      if (ev.dati.titolo) await trx.updateTable("sessioni").set({ titolo: ev.dati.titolo }).where("session_id", "=", s.session_id).execute();
      await transizione(trx, s, ev.tipo === "stop" ? "in_attesa" : "chiusa", ev.ts);
      break;
  }

  const risposta: Risposta = {
    progetto: progetto.nome,
    cantiere: await cantiereRisposta(trx, s),
    contesto,
    config: { modalita_resoconto: config.modalita_resoconto, soglia_strumenti: config.soglia_strumenti },
  };
  return [{ codice: 200, risposta }, s.cantiere_id];
}

/**
 * La sessione dell'evento, creata al volo se serve. Un progetto diverso da quello salvato la
 * sposta, in lavoro diretto. progettoId null (tool MCP) usa quello che la sessione ha già.
 */
export async function sessione(trx: Db, committenteId: number, sessionId: string, progettoId: number | null, luogo: Luogo | null, ora: string): Promise<Sessione> {
  const esistente = await sessioniDi(trx, TUTTI).selectAll().where("session_id", "=", sessionId).executeTakeFirst();
  if (esistente && esistente.committente_id !== committenteId) throw new Rifiuto(422, "session_id non valido.");
  if (esistente) {
    const sposta = progettoId !== null && progettoId !== esistente.progetto_id;
    return trx
      .updateTable("sessioni")
      .set({
        ...luogo,
        ultimo_evento_il: ora,
        ...(sposta ? { progetto_id: progettoId, cantiere_id: null, origine_associazione: null } : {}),
      })
      .where("session_id", "=", sessionId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
  if (progettoId === null) throw new Rifiuto(422, SERVE_PROGETTO);
  return trx
    .insertInto("sessioni")
    .values({
      session_id: sessionId,
      committente_id: committenteId,
      progetto_id: progettoId,
      cantiere_id: null,
      origine_associazione: null,
      stato: "attiva",
      turni: 0,
      titolo: null,
      avviso: null,
      ...(luogo ?? LUOGO_MCP),
      avviata_il: ora,
      ultimo_evento_il: ora,
      chiusa_il: null,
      ultimo_ts_stato: null,
      ultimo_ts_todo: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function associa(trx: Db, sessionId: string, cantiereId: number, origine: Origine) {
  return trx
    .updateTable("sessioni")
    .set({ cantiere_id: cantiereId, origine_associazione: origine, avviso: null })
    .where("session_id", "=", sessionId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function contestoAvvio(trx: Db, config: Config, committente: Committente, progetto: Progetto, s: Sessione) {
  const cantieri = await leggiCantieri(trx, config, TUTTI, { progettoId: progetto.id, sessioni: false });
  const percorsi = (stato: StatoCantiere) => cantieri.filter((c) => c.stato === stato).map((c) => c.percorso);
  const corrente = s.cantiere_id === null ? null : cantieri.find((c) => c.id === s.cantiere_id);
  return testi.contestoAvvio({
    sessionId: s.session_id,
    committente: committente.nome,
    progetto: progetto.nome,
    cantiere: corrente && s.origine_associazione ? { percorso: corrente.percorso, origine: s.origine_associazione } : null,
    aperti: percorsi("aperto"),
    idee: percorsi("idea"),
    daArchiviare: cantieri.filter((c) => c.da_archiviare).map((c) => c.change),
    conResoconto: config.modalita_resoconto !== "off",
  });
}

// --- Cantieri -----------------------------------------------------------------------------------

export const cantieriDelProgetto = (db: Db, progettoId: number) =>
  cantieriDi(db, TUTTI).selectAll("cantieri").where("cantieri.progetto_id", "=", progettoId);

/** Il cantiere e i suoi antenati, dal primo livello in giù. */
export async function risali(db: Db, id: number): Promise<Cantiere[]> {
  const catena: Cantiere[] = [];
  for (let corrente: number | null = id; corrente !== null; ) {
    const c: Cantiere = await cantieriDi(db, TUTTI).selectAll("cantieri").where("cantieri.id", "=", corrente).executeTakeFirstOrThrow();
    catena.unshift(c);
    corrente = c.padre_id;
  }
  return catena;
}

export const percorsoDi = async (db: Db, id: number) => (await risali(db, id)).map((c) => c.nome).join("/");

/** Percorso di ogni cantiere, da un elenco che contiene anche i suoi antenati. */
export function mappaPercorsi(righe: { id: number; padre_id: number | null; nome: string }[]): Map<number, string> {
  const perId = new Map(righe.map((r) => [r.id, r]));
  const percorsi = new Map<number, string>();
  const percorso = (id: number): string => {
    const fatto = percorsi.get(id);
    if (fatto !== undefined) return fatto;
    const r = perId.get(id)!;
    const p = r.padre_id === null ? r.nome : `${percorso(r.padre_id)}/${r.nome}`;
    percorsi.set(id, p);
    return p;
  };
  for (const r of righe) percorso(r.id);
  return percorsi;
}

interface NuovoCantiere {
  progetto_id: number;
  padre_id: number | null;
  nome: string;
  slugPercorso: string[];
  descrizione: string | null;
  stato: StatoCantiere;
  origine: OrigineCantiere;
}

/** Inserisce il cantiere; il nome del change viene dal percorso. Il primo stato va nello storico. */
export async function creaCantiere(trx: Db, n: NuovoCantiere, ora: string): Promise<Cantiere> {
  const c = await trx
    .insertInto("cantieri")
    .values({
      progetto_id: n.progetto_id,
      padre_id: n.padre_id,
      nome: n.nome,
      slug: n.slugPercorso[n.slugPercorso.length - 1],
      percorso_slug: n.slugPercorso.join("/"),
      change: nomeChange(n.slugPercorso),
      descrizione: n.descrizione,
      stato: n.stato,
      origine: n.origine,
      creato_il: ora,
      aggiornato_il: ora,
      stato_il: ora,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await trx.insertInto("esiti").values({ cantiere_id: c.id, stato: n.stato, ts: ora, da: n.origine }).execute();
  return c;
}

/** Motivo del rifiuto se il nome di change del percorso è già di un altro cantiere del progetto. */
export async function changeOccupato(trx: Db, progettoId: number, slugPercorso: string[]): Promise<string | null> {
  const change = nomeChange(slugPercorso);
  const altro = await cantieriDelProgetto(trx, progettoId).where("cantieri.change", "=", change).executeTakeFirst();
  return altro ? changePreso(change, await percorsoDi(trx, altro.id)) : null;
}

/**
 * apri_cantiere: il percorso si legge dal primo livello del progetto. Prima si controlla tutto in
 * sola lettura, poi si creano gli antenati che mancano; un antenato in stato idea passa ad aperto.
 * Restituisce l'ultimo cantiere, o il motivo del rifiuto.
 */
async function apriPercorso(
  trx: Transaction<DB>,
  progettoId: number,
  nomi: string[],
  descrizione: string | null,
  origine: Origine,
  ora: string,
): Promise<Cantiere | string> {
  const slug = nomi.map(slugifica);
  const passi: { nome: string; esistente: Cantiere | undefined }[] = [];
  for (const [i, nome] of nomi.entries()) {
    const esistente = await cantieriDelProgetto(trx, progettoId)
      .where("cantieri.percorso_slug", "=", slug.slice(0, i + 1).join("/"))
      .executeTakeFirst();
    if (esistente) {
      const percorso = await percorsoDi(trx, esistente.id);
      if (esistente.stato === "idea" && i === nomi.length - 1) return comePrendere(percorso);
      if (esistente.stato !== "idea" && esistente.stato !== "aperto") return nonApribile(percorso, esistente.stato);
    } else {
      const occupato = await changeOccupato(trx, progettoId, slug.slice(0, i + 1));
      if (occupato) return occupato;
    }
    passi.push({ nome, esistente });
  }
  let padreId: number | null = null;
  let c: Cantiere | undefined;
  for (const [i, p] of passi.entries()) {
    if (p.esistente?.stato === "idea") await cambiaStato(trx, p.esistente, "aperto", origine, ora);
    c =
      p.esistente ??
      (await creaCantiere(
        trx,
        {
          progetto_id: progettoId,
          padre_id: padreId,
          nome: p.nome,
          slugPercorso: slug.slice(0, i + 1),
          descrizione: i === passi.length - 1 ? descrizione : null,
          stato: "aperto",
          origine,
        },
        ora,
      ));
    padreId = c.id;
  }
  return c!;
}

/**
 * Cambia lo stato e lo scrive nello storico. Se il cantiere smette di essere aperto, le sue
 * sessioni tornano al lavoro diretto con un avviso per il loro primo prompt.
 */
export async function cambiaStato(trx: Db, c: Cantiere, stato: StatoCantiere, da: string, ora: string, ts = ora) {
  await trx.updateTable("cantieri").set({ stato, stato_il: ts, aggiornato_il: ora }).where("id", "=", c.id).execute();
  await trx.insertInto("esiti").values({ cantiere_id: c.id, stato, ts, da }).execute();
  if (c.stato === "aperto" && stato !== "aperto") {
    const progetto = await progettiDi(trx, TUTTI).select("nome").where("id", "=", c.progetto_id).executeTakeFirstOrThrow();
    await trx
      .updateTable("sessioni")
      .set({ cantiere_id: null, origine_associazione: null, avviso: testi.avvisoNonAperto(await percorsoDi(trx, c.id), stato, progetto.nome) })
      .where("cantiere_id", "=", c.id)
      .execute();
  }
}

const TRANSIZIONI: Record<"sospendi" | "riattiva" | "abbandona", { da: StatoCantiere[]; a: StatoCantiere; verbo: string }> = {
  sospendi: { da: ["aperto"], a: "sospeso", verbo: "sospendere" },
  riattiva: { da: ["sospeso"], a: "aperto", verbo: "riattivare" },
  abbandona: { da: ["idea", "aperto", "sospeso"], a: "abbandonato", verbo: "abbandonare" },
};
export type Azione = keyof typeof TRANSIZIONI;
export const AZIONI = Object.keys(TRANSIZIONI) as Azione[];

/** Discendenti non finali, dal livello più vicino in giù. */
export async function discendentiAttivi(db: Db, id: number): Promise<Cantiere[]> {
  const trovati: Cantiere[] = [];
  for (let livello = [id]; livello.length; ) {
    const figli = await cantieriDi(db, TUTTI).selectAll("cantieri").where("cantieri.padre_id", "in", livello).execute();
    trovati.push(...figli.filter((f) => !STATI_FINALI.includes(f.stato)));
    livello = figli.map((f) => f.id);
  }
  return trovati;
}

/** Esito deciso dalla dashboard; abbandonare un padre abbandona anche i discendenti non finali. */
export function cambiaEsito(amb: Ambiente, ambito: Ambito, cantiereId: number, azione: Azione) {
  return amb.db.transaction().execute(async (trx) => {
    const c = await cantieriDi(trx, ambito).selectAll("cantieri").where("cantieri.id", "=", cantiereId).executeTakeFirst();
    if (!c) throw new Rifiuto(404, "Cantiere inesistente.");
    const t = TRANSIZIONI[azione];
    if (!t.da.includes(c.stato)) throw new Rifiuto(409, `Il cantiere "${await percorsoDi(trx, c.id)}" è ${c.stato}: non si può ${t.verbo}.`);
    const ora = adesso();
    const toccati = [c, ...(azione === "abbandona" ? await discendentiAttivi(trx, c.id) : [])];
    for (const x of toccati) await cambiaStato(trx, x, t.a, "dashboard", ora);
    return leggiCantieri(trx, amb.config, ambito, { ids: toccati.map((x) => x.id) });
  });
}

async function cantiereRisposta(db: Db, s: Sessione): Promise<CantiereRisposta | null> {
  if (s.cantiere_id === null || s.origine_associazione === null) return null;
  const catena = await risali(db, s.cantiere_id);
  const c = catena[catena.length - 1];
  return { id: c.id, nome: c.nome, percorso: catena.map((x) => x.nome).join("/"), origine: s.origine_associazione, stato: c.stato, change: c.change };
}

/** Le transizioni si applicano solo se l'evento non è più vecchio dell'ultimo applicato. */
async function transizione(trx: Db, s: Sessione, stato: StatoSessione, ts: string) {
  if (s.ultimo_ts_stato !== null && ts < s.ultimo_ts_stato) return;
  await trx
    .updateTable("sessioni")
    .set({ stato, ultimo_ts_stato: ts, chiusa_il: stato === "chiusa" ? ts : null })
    .where("session_id", "=", s.session_id)
    .execute();
}

type VoceTodo = { id: string | null; testo: string; stato: string };

async function applicaTodo(trx: Db, s: Sessione, ts: string, completo: boolean, voci: VoceTodo[]) {
  if (s.ultimo_ts_todo !== null && ts < s.ultimo_ts_todo) return; // più vecchio dell'ultimo snapshot
  const dellaSessione = trx.deleteFrom("todo").where("session_id", "=", s.session_id);
  if (completo) {
    await dellaSessione.execute();
    const righe = voci
      .map((v, ordine) => ({ ...v, ordine }))
      .filter((v) => v.stato !== "deleted")
      .map((v) => ({
        session_id: s.session_id,
        chiave: v.id ?? `#${v.ordine}`,
        testo: v.testo,
        stato: v.stato,
        ordine: v.ordine,
        aggiornato_il: ts,
      }));
    if (righe.length) await trx.insertInto("todo").values(righe).execute();
    await trx.updateTable("sessioni").set({ ultimo_ts_todo: ts }).where("session_id", "=", s.session_id).execute();
    return;
  }
  for (const v of voci) {
    if (v.id === null) continue; // una variazione senza id non dice a quale todo si applica
    const voce = trx.selectFrom("todo").where("session_id", "=", s.session_id).where("chiave", "=", v.id);
    const esistente = await voce.select(["testo", "aggiornato_il"]).executeTakeFirst();
    if (esistente && ts < esistente.aggiornato_il) continue;
    if (v.stato === "deleted") {
      await dellaSessione.where("chiave", "=", v.id).execute();
    } else if (esistente) {
      await trx
        .updateTable("todo")
        .set({ testo: v.testo || esistente.testo, stato: v.stato, aggiornato_il: ts })
        .where("session_id", "=", s.session_id)
        .where("chiave", "=", v.id)
        .execute();
    } else {
      const { ultimo } = await trx
        .selectFrom("todo")
        .select((eb) => eb.fn.max("ordine").as("ultimo"))
        .where("session_id", "=", s.session_id)
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("todo")
        .values({ session_id: s.session_id, chiave: v.id, testo: v.testo, stato: v.stato, ordine: (ultimo ?? -1) + 1, aggiornato_il: ts })
        .execute();
    }
  }
}

// --- Tool MCP che non sono eventi ----------------------------------------------------------------

/** Progetto indicato da un tool, o null se il tool non lo dice. */
async function progettoDelTool(db: Db, committenteId: number, nome: string | undefined): Promise<number | null> {
  if (!nome) return null;
  const p = await progettoPerNome(db, di(committenteId), nome);
  if (!p) throw new Rifiuto(422, `Il progetto "${nome}" non esiste.`);
  return p.id;
}

/** Nome del progetto di una sessione già nota, per i tool che non lo ricevono. */
export async function progettoDellaSessione(db: Db, committenteId: number, sessionId: string): Promise<string | null> {
  const s = await sessioniDi(db, di(committenteId))
    .innerJoin("progetti", "progetti.id", "sessioni.progetto_id")
    .select("progetti.nome")
    .where("sessioni.session_id", "=", sessionId)
    .executeTakeFirst();
  return s?.nome ?? null;
}

export interface Resoconto {
  session_id: string;
  fatto: string;
  prossimo: string;
  bloccato_da?: string | null;
  percentuale?: number | null;
  progetto?: string;
}

export function aggiornaStato(amb: Ambiente, committente: Committente, r: Resoconto): Promise<CantiereRisposta | null> {
  return amb.db.transaction().execute(async (trx) => {
    const ora = adesso();
    const s = await sessione(trx, committente.id, r.session_id, await progettoDelTool(trx, committente.id, r.progetto), null, ora);
    await trx
      .insertInto("stati")
      .values({
        session_id: s.session_id,
        progetto_id: s.progetto_id,
        cantiere_id: s.cantiere_id,
        ts: ora,
        fatto: r.fatto,
        prossimo: r.prossimo,
        bloccato_da: r.bloccato_da ?? null,
        percentuale: r.percentuale ?? null,
      })
      .execute();
    if (s.cantiere_id !== null) await trx.updateTable("cantieri").set({ aggiornato_il: ora }).where("id", "=", s.cantiere_id).execute();
    return cantiereRisposta(trx, s);
  });
}

export async function statoSessione(amb: Ambiente, committente: Committente, sessionId: string) {
  const s = await sessioniDi(amb.db, di(committente.id)).selectAll().where("session_id", "=", sessionId).executeTakeFirst();
  if (!s) return { progetto: null, cantiere: null, ultimo_stato: null, todo: [] };
  const ultimo = await amb.db
    .selectFrom("stati")
    .select(["ts", "fatto", "prossimo", "bloccato_da", "percentuale"])
    .where("session_id", "=", sessionId)
    .orderBy("id", "desc")
    .executeTakeFirst();
  const todo = await amb.db
    .selectFrom("todo")
    .select(["chiave as id", "testo", "stato"])
    .where("session_id", "=", sessionId)
    .orderBy("ordine")
    .execute();
  return { progetto: await progettoDellaSessione(amb.db, committente.id, sessionId), cantiere: await cantiereRisposta(amb.db, s), ultimo_stato: ultimo ?? null, todo };
}

// --- Letture ------------------------------------------------------------------------------------

const ATTIVE = new Set(["attiva", "lavorando", "in_attesa"]);

/** Lo stato "inattiva" si calcola in lettura e non si scrive mai nel database. */
export function statoVisibile(s: { stato: string; ultimo_evento_il: string }, inattivitaMinuti: number, ora = Date.now()) {
  const ferma = ora - Date.parse(s.ultimo_evento_il) > inattivitaMinuti * 60_000;
  return s.stato !== "chiusa" && ferma ? "inattiva" : s.stato;
}

const etaSecondi = (ts: string, ora: number) => Math.max(0, Math.round((ora - Date.parse(ts)) / 1000));

export interface FiltroSessioni {
  progetto?: string;
  progettoId?: number;
  attive?: boolean;
  cantieri?: number[];
  senzaCantiere?: boolean;
}

/** Sessioni dell'ambito nella forma di GET /api/v1/sessioni, dalla più recente. */
export async function elencaSessioni(db: Db, config: Config, ambito: Ambito, filtro: FiltroSessioni = {}) {
  const ora = Date.now();
  let q = sessioniDi(db, ambito)
    .innerJoin("progetti", "progetti.id", "sessioni.progetto_id")
    .select([
      "sessioni.session_id",
      "progetti.nome as progetto",
      "sessioni.progetto_id",
      "sessioni.cantiere_id",
      "sessioni.host",
      "sessioni.cwd",
      "sessioni.repo",
      "sessioni.branch",
      "sessioni.stato",
      "sessioni.origine_associazione",
      "sessioni.turni",
      "sessioni.titolo",
      "sessioni.avviata_il",
      "sessioni.ultimo_evento_il",
    ])
    .orderBy("sessioni.ultimo_evento_il", "desc");
  if (filtro.progetto !== undefined) q = q.where("progetti.slug", "=", slugifica(filtro.progetto));
  if (filtro.progettoId !== undefined) q = q.where("sessioni.progetto_id", "=", filtro.progettoId);
  if (filtro.cantieri) q = q.where("sessioni.cantiere_id", "in", filtro.cantieri.length ? filtro.cantieri : [-1]);
  if (filtro.senzaCantiere) q = q.where("sessioni.cantiere_id", "is", null);
  const righe = await q.execute();
  const progettiId = [...new Set(righe.map((r) => r.progetto_id))];
  const percorsi = mappaPercorsi(
    progettiId.length ? await cantieriDi(db, ambito).select(["cantieri.id", "cantieri.padre_id", "cantieri.nome"]).where("cantieri.progetto_id", "in", progettiId).execute() : [],
  );
  return righe
    .map(({ cantiere_id, ...r }) => ({
      ...r,
      cantiere_id,
      cantiere: cantiere_id === null ? null : (percorsi.get(cantiere_id) ?? null),
      stato: statoVisibile(r, config.inattivita_minuti, ora),
      eta_secondi: etaSecondi(r.ultimo_evento_il, ora),
    }))
    .filter((r) => !filtro.attive || ATTIVE.has(r.stato));
}

export interface FiltroCantieri {
  progetto?: string;
  progettoId?: number;
  stati?: readonly StatoCantiere[];
  ids?: number[];
  /** false: senza l'elenco delle sessioni attive (risposta della copia, contesto di avvio). */
  sessioni?: boolean;
}

/** Cantieri dell'ambito nella forma di GET /api/v1/cantieri (Contratto v2). */
export async function leggiCantieri(db: Db, config: Config, ambito: Ambito, filtro: FiltroCantieri = {}) {
  let q = cantieriDi(db, ambito).selectAll("cantieri").select(["progetti.nome as progetto", "progetti.openspec_il"]).orderBy("cantieri.aggiornato_il", "desc");
  if (filtro.progetto !== undefined) q = q.where("progetti.slug", "=", slugifica(filtro.progetto));
  if (filtro.progettoId !== undefined) q = q.where("cantieri.progetto_id", "=", filtro.progettoId);
  if (filtro.ids) {
    const progetti = await cantieriDi(db, ambito).select("cantieri.progetto_id").where("cantieri.id", "in", filtro.ids.length ? filtro.ids : [-1]).execute();
    q = q.where("cantieri.progetto_id", "in", progetti.length ? progetti.map((p) => p.progetto_id) : [-1]);
  }
  // Si leggono tutti i cantieri dei progetti toccati: servono gli antenati per i percorsi e i figli per le fasi.
  const righe = await q.execute();
  const ids = righe.map((r) => r.id);
  const percorsi = mappaPercorsi(righe);
  const copie = new Map((ids.length ? await db.selectFrom("change_copie").selectAll().where("cantiere_id", "in", ids).execute() : []).map((c) => [c.cantiere_id, c]));
  const fileIdea = new Map(
    (ids.length
      ? await db.selectFrom("idee_file").select(["cantiere_id", (eb) => eb.fn.countAll<number>().as("n")]).where("cantiere_id", "in", ids).groupBy("cantiere_id").execute()
      : []
    ).map((r) => [r.cantiere_id, Number(r.n)]),
  );
  const scelti = righe.filter((r) => (!filtro.stati || filtro.stati.includes(r.stato)) && (!filtro.ids || filtro.ids.includes(r.id)));
  const sessioni = filtro.sessioni === false ? [] : await sessioniAttive(db, config, ambito, scelti.map((r) => r.id));
  return scelti.map(({ slug, percorso_slug, openspec_il, ...c }) => {
    const copia = copie.get(c.id);
    const figli = righe.filter((f) => f.padre_id === c.id);
    // Il change compariva nell'ultima copia del progetto, attivo o archiviato?
    const visto = !!copia && openspec_il !== null && copia.visto_il >= openspec_il;
    return {
      ...c,
      percorso: percorsi.get(c.id)!,
      artefatti: copia ? (JSON.parse(copia.artefatti) as Record<string, boolean>) : null,
      task: copia && copia.task_totali !== null ? { fatti: copia.task_fatti, totali: copia.task_totali } : null,
      fasi: figli.length ? { completate: figli.filter((f) => f.stato === "completato").length, totali: figli.filter((f) => f.stato !== "abbandonato").length } : null,
      change_mancante: c.stato === "aperto" && openspec_il !== null && !visto,
      da_archiviare: c.stato === "abbandonato" && visto && copia!.archiviato_il === null,
      file_idea: fileIdea.get(c.id) ?? 0,
      ...(filtro.sessioni === false ? {} : { sessioni: sessioni.filter((s) => s.cantiere_id === c.id).map(({ cantiere_id, ...s }) => s) }),
    };
  });
}

export type CantiereLetto = Awaited<ReturnType<typeof leggiCantieri>>[number];

/** Sessioni attive dei cantieri, con l'ultimo fatto e prossimo. */
async function sessioniAttive(db: Db, config: Config, ambito: Ambito, cantieri: number[]) {
  const sessioni = await elencaSessioni(db, config, ambito, { cantieri, attive: true });
  const ultimi = new Map<string, { fatto: string; prossimo: string }>();
  const idSessioni = sessioni.map((s) => s.session_id);
  if (idSessioni.length) {
    for (const st of await db.selectFrom("stati").select(["session_id", "fatto", "prossimo"]).where("session_id", "in", idSessioni).orderBy("id", "desc").execute()) {
      if (!ultimi.has(st.session_id)) ultimi.set(st.session_id, st);
    }
  }
  return sessioni.map((s) => ({
    cantiere_id: s.cantiere_id,
    session_id: s.session_id,
    host: s.host,
    branch: s.branch,
    stato: s.stato,
    titolo: s.titolo,
    fatto: ultimi.get(s.session_id)?.fatto ?? null,
    prossimo: ultimi.get(s.session_id)?.prossimo ?? null,
    eta_secondi: s.eta_secondi,
  }));
}

export async function pulizia(amb: Ambiente): Promise<{ eventi: number; stati: number }> {
  const limite = new Date(Date.now() - amb.config.retention_giorni * 86_400_000).toISOString();
  const eventi = await amb.db.deleteFrom("eventi").where("ricevuto_il", "<", limite).executeTakeFirst();
  const stati = await amb.db.deleteFrom("stati").where("ts", "<", limite).executeTakeFirst();
  return { eventi: Number(eventi.numDeletedRows), stati: Number(stati.numDeletedRows) };
}
