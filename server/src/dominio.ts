import type { Kysely, Selectable, Transaction } from "kysely";
import type { Config } from "./config.ts";
import * as testi from "./contesto.ts";
import type { CantiereRisposta } from "./contesto.ts";
import { violaUnicita, type DB } from "./db.ts";
import { segmenti, slugifica, type Evento, type Luogo, type Origine, type StatoSessione } from "./modelli.ts";

export interface Ambiente {
  db: Kysely<DB>;
  config: Config;
}

export interface Risposta {
  cantiere: CantiereRisposta | null;
  contesto: string | null;
  config: Pick<Config, "modalita_resoconto" | "soglia_strumenti">;
}

export type Esito = { codice: 200; risposta: Risposta } | { codice: 409; risposta: { errore: string } };

type Tx = Transaction<DB>;
type Sessione = Selectable<DB["sessioni"]>;
type Cantiere = Selectable<DB["cantieri"]>;

export const RIFIUTO_PRECEDENZA =
  "Il cantiere di questa sessione l'ha scelto l'utente: solo l'utente può cambiarlo. Non riprovare.";
const padreDiverso = (nome: string, padre: string) => `Il cantiere "${nome}" è già figlio di "${padre}": il padre non cambia.`;
const ciclo = (percorso: string, nome: string) => `Il percorso "${percorso}" farebbe di "${nome}" l'antenato di sé stesso.`;
const figliAperti = (percorso: string, figli: string[]) =>
  `Il cantiere "${percorso}" ha figli aperti: ${figli.join(", ")}. Chiuderli insieme richiede forza, solo con l'ok dell'utente (/cantiere chiudi -f).`;

const RANGO: Record<Origine, number> = { auto: 0, claude: 1, utente: 2 };
// Sessione creata da un client senza hook (MCP): host e cwd non si conoscono.
const LUOGO_MCP: Luogo = { host: "mcp", cwd: "", repo: null, branch: null };

export const adesso = () => new Date().toISOString();

/**
 * Applica un evento in modo idempotente: lo stesso evento_id restituisce la risposta salvata
 * la prima volta, senza riapplicare effetti. luogo è null per gli eventi interni dei tool MCP.
 */
export async function riceviEvento(amb: Ambiente, clienteId: number, ev: Evento, luogo: Luogo | null): Promise<Esito> {
  try {
    return await amb.db.transaction().execute(async (trx) => {
      const ora = adesso();
      await trx
        .insertInto("eventi")
        .values({
          evento_id: ev.evento_id,
          ts: ev.ts,
          ricevuto_il: ora,
          cliente_id: clienteId,
          session_id: ev.session_id,
          cantiere_id: null,
          tipo: ev.tipo,
          dati: JSON.stringify(ev.dati),
          codice_http: 0,
          risposta: "",
        })
        .execute();
      const [esito, cantiereId] = await applica(trx, amb.config, clienteId, ev, luogo, ora);
      await trx
        .updateTable("eventi")
        .set({ codice_http: esito.codice, risposta: JSON.stringify(esito.risposta), cantiere_id: cantiereId })
        .where("evento_id", "=", ev.evento_id)
        .execute();
      return esito;
    });
  } catch (errore) {
    if (!violaUnicita(errore)) throw errore;
    const salvato = await amb.db
      .selectFrom("eventi")
      .select(["codice_http", "risposta"])
      .where("evento_id", "=", ev.evento_id)
      .executeTakeFirstOrThrow();
    return { codice: salvato.codice_http, risposta: JSON.parse(salvato.risposta) } as Esito;
  }
}

async function applica(
  trx: Tx,
  config: Config,
  clienteId: number,
  ev: Evento,
  luogo: Luogo | null,
  ora: string,
): Promise<[Esito, number | null]> {
  let s = await sessione(trx, clienteId, ev.session_id, luogo, ora);
  let contesto: string | null = null;

  if (ev.tipo === "apri_cantiere") {
    if (s.origine_associazione && RANGO[ev.dati.origine] < RANGO[s.origine_associazione]) {
      return [{ codice: 409, risposta: { errore: RIFIUTO_PRECEDENZA } }, s.cantiere_id];
    }
    const nomi = [...(ev.dati.padre ? segmenti(ev.dati.padre) : []), ...segmenti(ev.dati.nome)];
    const passi = await risolviPercorso(trx, nomi);
    if (typeof passi === "string") return [{ codice: 409, risposta: { errore: passi } }, s.cantiere_id];
    const c = await creaPercorso(trx, passi, ev.dati.descrizione ?? null, ev.dati.origine, s, ora);
    s = await associa(trx, s.session_id, c.id, ev.dati.origine, true);
    contesto = testi.confermaApertura(await percorsoDi(trx, c.id), c.id);
  } else if (ev.tipo === "chiudi_cantiere") {
    if (s.cantiere_id === null) {
      contesto = testi.nienteDaChiudere();
    } else {
      const percorso = await percorsoDi(trx, s.cantiere_id);
      const discendenti = await discendentiAperti(trx, s.cantiere_id);
      if (discendenti.length && !ev.dati.forza) {
        const figli = discendenti.filter((d) => d.padre_id === s.cantiere_id).map((d) => d.nome);
        return [{ codice: 409, risposta: { errore: figliAperti(percorso, figli) } }, s.cantiere_id];
      }
      for (const id of [...discendenti.map((d) => d.id), s.cantiere_id]) await chiudi(trx, id, ev.dati.esito, ev.dati.nota ?? null, ora);
      s = { ...s, cantiere_id: null, origine_associazione: null, confermato: 0 };
      contesto = testi.confermaChiusura(percorso, ev.dati.esito, discendenti.map((d) => d.nome));
    }
  } else {
    if (s.cantiere_id === null) s = await associaAuto(trx, s, ora);
    const cantiere = await cantiereDi(trx, s);
    switch (ev.tipo) {
      case "session_start":
        await transizione(trx, s, "attiva", ev.ts);
        contesto = cantiere && testi.contestoAvvio(s.session_id, cantiere, config.modalita_resoconto !== "off");
        break;
      case "prompt":
        await trx
          .updateTable("sessioni")
          .set((eb) => ({ turni: eb("turni", "+", 1) }))
          .where("session_id", "=", s.session_id)
          .execute();
        await transizione(trx, s, "lavorando", ev.ts);
        if (cantiere && !cantiere.confermato && s.hint_inviati < config.hint_max) {
          await trx
            .updateTable("sessioni")
            .set({ hint_inviati: s.hint_inviati + 1 })
            .where("session_id", "=", s.session_id)
            .execute();
          contesto = testi.hintProvvisorio(cantiere.nome);
        }
        break;
      case "todo":
        await applicaTodo(trx, s, ev.ts, ev.dati.completo, ev.dati.todos);
        break;
      case "stop":
        await transizione(trx, s, "in_attesa", ev.ts);
        break;
      case "session_end":
        await transizione(trx, s, "chiusa", ev.ts);
        break;
    }
  }

  const risposta: Risposta = {
    cantiere: await cantiereDi(trx, s),
    contesto,
    config: { modalita_resoconto: config.modalita_resoconto, soglia_strumenti: config.soglia_strumenti },
  };
  return [{ codice: 200, risposta }, s.cantiere_id];
}

async function sessione(trx: Tx, clienteId: number, sessionId: string, luogo: Luogo | null, ora: string): Promise<Sessione> {
  const aggiornata = await trx
    .updateTable("sessioni")
    .set({ ...luogo, ultimo_evento_il: ora })
    .where("session_id", "=", sessionId)
    .returningAll()
    .executeTakeFirst();
  return (
    aggiornata ??
    (await trx
      .insertInto("sessioni")
      .values({
        session_id: sessionId,
        cliente_id: clienteId,
        ...(luogo ?? LUOGO_MCP),
        cantiere_id: null,
        origine_associazione: null,
        confermato: 0,
        stato: "attiva",
        turni: 0,
        hint_inviati: 0,
        avviata_il: ora,
        ultimo_evento_il: ora,
        chiusa_il: null,
        ultimo_ts_stato: null,
        ultimo_ts_todo: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow())
  );
}

const cartella = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? "";
// Senza git il confronto usa il nome della cartella al posto del repo.
const chiaveLuogo = (l: { repo: string | null; cwd: string; branch: string | null }) =>
  JSON.stringify([l.repo ?? cartella(l.cwd), l.branch]);

function nomeProvvisorio(s: Sessione): string {
  const base = (s.repo ? s.repo.split("/").pop() : cartella(s.cwd)) || "senza-cartella";
  return s.branch ? `${base}@${s.branch}` : base;
}

/** Sessione senza cantiere: aggancio al cantiere aperto con lo stesso luogo, o provvisorio nuovo. */
async function associaAuto(trx: Tx, s: Sessione, ora: string): Promise<Sessione> {
  const recenti = await trx
    .selectFrom("sessioni")
    .innerJoin("cantieri", "cantieri.id", "sessioni.cantiere_id")
    .select(["sessioni.cantiere_id", "sessioni.repo", "sessioni.cwd", "sessioni.branch"])
    .where("cantieri.stato", "=", "aperto")
    .orderBy("sessioni.ultimo_evento_il", "desc")
    .execute();
  const visti = new Set<number | null>();
  let trovato: number | null = null;
  for (const r of recenti) {
    if (visti.has(r.cantiere_id)) continue; // conta solo la sessione più recente di ogni cantiere
    visti.add(r.cantiere_id);
    if (chiaveLuogo(r) === chiaveLuogo(s)) {
      trovato = r.cantiere_id;
      break;
    }
  }
  const cantiereId = trovato ?? (await cantierePerNome(trx, nomeProvvisorio(s), "auto", s, ora)).id;
  return associa(trx, s.session_id, cantiereId, "auto", false);
}

const aperto = (trx: Tx, nome: string) =>
  trx.selectFrom("cantieri").selectAll().where("slug_aperto", "=", slugifica(nome)).executeTakeFirst();

/** Entra nel cantiere aperto con lo stesso slug, su qualunque repo, oppure lo crea senza padre. */
async function cantierePerNome(trx: Tx, nome: string, origine: Origine, s: Sessione, ora: string): Promise<Cantiere> {
  return (await aperto(trx, nome)) ?? creaCantiere(trx, nome, null, origine, s, ora, null);
}

type Passo = { nome: string; esistente: Cantiere | undefined };

/**
 * Prima fase di apri_cantiere, in sola lettura: i cantieri del percorso che esistono già, oppure il
 * motivo del rifiuto se il percorso cambierebbe il padre di qualcuno o farebbe un ciclo.
 */
async function risolviPercorso(trx: Tx, nomi: string[]): Promise<Passo[] | string> {
  const percorso = nomi.join("/");
  const slug = nomi.map(slugifica);
  const doppio = slug.findIndex((x, i) => slug.indexOf(x) !== i);
  if (doppio >= 0) return ciclo(percorso, nomi[doppio]);
  const passi: Passo[] = [];
  for (const [i, nome] of nomi.entries()) {
    const esistente = await aperto(trx, nome);
    const padre = passi[i - 1]?.esistente;
    if (i > 0 && esistente) {
      if (esistente.padre_id !== null && esistente.padre_id !== padre?.id) {
        return padreDiverso(esistente.nome, await percorsoDi(trx, esistente.padre_id));
      }
      if (padre && (await risali(trx, padre.id)).some((c) => c.id === esistente.id)) return ciclo(percorso, esistente.nome);
    }
    passi.push({ nome, esistente });
  }
  return passi;
}

/** Seconda fase: crea gli antenati mancanti, dà il padre a chi non lo ha e restituisce l'ultimo cantiere. */
async function creaPercorso(trx: Tx, passi: Passo[], descrizione: string | null, origine: Origine, s: Sessione, ora: string) {
  let padreId: number | null = null;
  let c: Cantiere | undefined;
  for (const [i, p] of passi.entries()) {
    c = p.esistente ?? (await creaCantiere(trx, p.nome, i === passi.length - 1 ? descrizione : null, origine, s, ora, padreId));
    if (p.esistente && padreId !== null && p.esistente.padre_id === null) {
      await trx.updateTable("cantieri").set({ padre_id: padreId }).where("id", "=", c.id).execute();
    }
    padreId = c.id;
  }
  return c!;
}

/** Il cantiere e i suoi antenati, dal più alto in giù. */
async function risali(db: Kysely<DB>, id: number): Promise<{ id: number; nome: string }[]> {
  const catena = [];
  for (let corrente: number | null = id; corrente !== null; ) {
    const c = await db.selectFrom("cantieri").select(["id", "nome", "padre_id"]).where("id", "=", corrente).executeTakeFirstOrThrow();
    catena.unshift({ id: c.id, nome: c.nome });
    corrente = c.padre_id;
  }
  return catena;
}

const percorsoDi = async (db: Kysely<DB>, id: number) => (await risali(db, id)).map((c) => c.nome).join("/");

/** Discendenti aperti, dal livello più vicino in giù. */
async function discendentiAperti(trx: Tx, id: number) {
  const trovati = [];
  for (let livello = [id]; livello.length; ) {
    const figli = await trx
      .selectFrom("cantieri")
      .select(["id", "nome", "padre_id"])
      .where("padre_id", "in", livello)
      .where("stato", "=", "aperto")
      .execute();
    trovati.push(...figli);
    livello = figli.map((f) => f.id);
  }
  return trovati;
}

function creaCantiere(
  trx: Tx,
  nome: string,
  descrizione: string | null,
  origine: Origine,
  s: Sessione,
  ora: string,
  padre_id: number | null,
): Promise<Cantiere> {
  const slug = slugifica(nome);
  return trx
    .insertInto("cantieri")
    .values({
      padre_id,
      nome,
      slug,
      slug_aperto: slug,
      descrizione,
      origine,
      stato: "aperto",
      esito: null,
      nota: null,
      repo: s.repo,
      branch: s.branch,
      creato_il: ora,
      aggiornato_il: ora,
      chiuso_il: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

function associa(trx: Tx, sessionId: string, cantiereId: number, origine: Origine, confermato: boolean) {
  return trx
    .updateTable("sessioni")
    .set({ cantiere_id: cantiereId, origine_associazione: origine, confermato: confermato ? 1 : 0 })
    .where("session_id", "=", sessionId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Chiude il cantiere per tutte le sessioni: restano senza cantiere fino al loro prossimo evento. */
async function chiudi(trx: Tx, cantiereId: number, esito: string, nota: string | null, ora: string) {
  await trx
    .updateTable("cantieri")
    .set({ stato: "chiuso", esito, nota, chiuso_il: ora, aggiornato_il: ora, slug_aperto: null })
    .where("id", "=", cantiereId)
    .execute();
  await trx
    .updateTable("sessioni")
    .set({ cantiere_id: null, origine_associazione: null, confermato: 0 })
    .where("cantiere_id", "=", cantiereId)
    .execute();
}

async function cantiereDi(trx: Tx, s: Sessione): Promise<CantiereRisposta | null> {
  if (s.cantiere_id === null || s.origine_associazione === null) return null;
  const catena = await risali(trx, s.cantiere_id);
  const { id, nome } = catena[catena.length - 1];
  const percorso = catena.map((c) => c.nome).join("/");
  return { id, nome, percorso, origine: s.origine_associazione, confermato: s.confermato === 1 };
}

/** Le transizioni si applicano solo se l'evento non è più vecchio dell'ultimo applicato. */
async function transizione(trx: Tx, s: Sessione, stato: StatoSessione, ts: string) {
  if (s.ultimo_ts_stato !== null && ts < s.ultimo_ts_stato) return;
  await trx
    .updateTable("sessioni")
    .set({ stato, ultimo_ts_stato: ts, chiusa_il: stato === "chiusa" ? ts : null })
    .where("session_id", "=", s.session_id)
    .execute();
}

type VoceTodo = { id: string | null; testo: string; stato: string };

async function applicaTodo(trx: Tx, s: Sessione, ts: string, completo: boolean, voci: VoceTodo[]) {
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

/** Sessione (creata se serve) con un cantiere: per i tool MCP che non sono eventi. */
async function sessioneConCantiere(trx: Tx, clienteId: number, sessionId: string, ora: string): Promise<Sessione> {
  const s = await sessione(trx, clienteId, sessionId, null, ora);
  return s.cantiere_id === null ? associaAuto(trx, s, ora) : s;
}

export interface Resoconto {
  session_id: string;
  fatto: string;
  prossimo: string;
  bloccato_da?: string | null;
  percentuale?: number | null;
}

export function aggiornaStato(amb: Ambiente, clienteId: number, r: Resoconto): Promise<CantiereRisposta | null> {
  return amb.db.transaction().execute(async (trx) => {
    const ora = adesso();
    const s = await sessioneConCantiere(trx, clienteId, r.session_id, ora);
    await trx
      .insertInto("stati")
      .values({
        session_id: s.session_id,
        cantiere_id: s.cantiere_id,
        ts: ora,
        fatto: r.fatto,
        prossimo: r.prossimo,
        bloccato_da: r.bloccato_da ?? null,
        percentuale: r.percentuale ?? null,
      })
      .execute();
    if (s.cantiere_id !== null) {
      await trx.updateTable("cantieri").set({ aggiornato_il: ora }).where("id", "=", s.cantiere_id).execute();
    }
    return cantiereDi(trx, s);
  });
}

export function statoSessione(amb: Ambiente, clienteId: number, sessionId: string) {
  return amb.db.transaction().execute(async (trx) => {
    const s = await sessioneConCantiere(trx, clienteId, sessionId, adesso());
    const ultimo = await trx
      .selectFrom("stati")
      .select(["ts", "fatto", "prossimo", "bloccato_da", "percentuale"])
      .where("session_id", "=", sessionId)
      .orderBy("id", "desc")
      .executeTakeFirst();
    const todo = await trx
      .selectFrom("todo")
      .select(["chiave as id", "testo", "stato"])
      .where("session_id", "=", sessionId)
      .orderBy("ordine")
      .execute();
    return { cantiere: await cantiereDi(trx, s), ultimo_stato: ultimo ?? null, todo };
  });
}

// --- Letture -----------------------------------------------------------------------------------

const ATTIVE = new Set(["attiva", "lavorando", "in_attesa"]);

/** Lo stato "inattiva" si calcola in lettura e non si scrive mai nel database. */
export function statoVisibile(s: { stato: string; ultimo_evento_il: string }, inattivitaMinuti: number, ora = Date.now()) {
  const ferma = ora - Date.parse(s.ultimo_evento_il) > inattivitaMinuti * 60_000;
  return s.stato !== "chiusa" && ferma ? "inattiva" : s.stato;
}

const etaSecondi = (ts: string, ora: number) => Math.max(0, Math.round((ora - Date.parse(ts)) / 1000));

export async function elencaSessioni(amb: Ambiente, filtro: { attive?: boolean } = {}) {
  const ora = Date.now();
  const righe = await amb.db
    .selectFrom("sessioni")
    .leftJoin("cantieri", "cantieri.id", "sessioni.cantiere_id")
    .leftJoin("clienti", "clienti.id", "sessioni.cliente_id")
    .select([
      "sessioni.session_id",
      "clienti.nome as cliente",
      "sessioni.host",
      "sessioni.cwd",
      "sessioni.repo",
      "sessioni.branch",
      "sessioni.stato",
      "sessioni.cantiere_id",
      "cantieri.nome as cantiere",
      "sessioni.origine_associazione",
      "sessioni.confermato",
      "sessioni.turni",
      "sessioni.avviata_il",
      "sessioni.ultimo_evento_il",
    ])
    .orderBy("sessioni.ultimo_evento_il", "desc")
    .execute();
  return righe
    .map((r) => ({
      ...r,
      confermato: r.confermato === 1,
      stato: statoVisibile(r, amb.config.inattivita_minuti, ora),
      eta_secondi: etaSecondi(r.ultimo_evento_il, ora),
    }))
    .filter((r) => !filtro.attive || ATTIVE.has(r.stato));
}

export async function elencaCantieri(amb: Ambiente, filtro: { aperti?: boolean; repo?: string } = {}) {
  let query = amb.db.selectFrom("cantieri").selectAll().orderBy("aggiornato_il", "desc");
  if (filtro.aperti) query = query.where("stato", "=", "aperto");
  const cantieri = await query.execute();
  const sessioni = await elencaSessioni(amb, { attive: true });
  const ultimi = new Map<string, { fatto: string; prossimo: string }>();
  for (const st of await amb.db.selectFrom("stati").select(["session_id", "fatto", "prossimo"]).orderBy("id", "desc").execute()) {
    if (!ultimi.has(st.session_id)) ultimi.set(st.session_id, st);
  }
  const percorsi = await Promise.all(cantieri.map((c) => percorsoDi(amb.db, c.id)));
  return cantieri
    .map(({ slug_aperto, ...c }, i) => ({
      ...c,
      percorso: percorsi[i],
      sessioni: sessioni
        .filter((s) => s.cantiere_id === c.id)
        .map((s) => ({
          session_id: s.session_id,
          host: s.host,
          branch: s.branch,
          stato: s.stato,
          fatto: ultimi.get(s.session_id)?.fatto ?? null,
          prossimo: ultimi.get(s.session_id)?.prossimo ?? null,
          eta_secondi: s.eta_secondi,
        })),
    }))
    .filter((c) => !filtro.repo || c.repo === filtro.repo || sessioni.some((s) => s.cantiere_id === c.id && s.repo === filtro.repo));
}

export async function pulizia(amb: Ambiente): Promise<{ eventi: number; stati: number }> {
  const limite = new Date(Date.now() - amb.config.retention_giorni * 86_400_000).toISOString();
  const eventi = await amb.db.deleteFrom("eventi").where("ricevuto_il", "<", limite).executeTakeFirst();
  const stati = await amb.db.deleteFrom("stati").where("ts", "<", limite).executeTakeFirst();
  return { eventi: Number(eventi.numDeletedRows), stati: Number(stati.numDeletedRows) };
}
