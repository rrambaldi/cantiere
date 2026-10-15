import { adesso, type Committente } from "./accesso.ts";
import { cantieriDi, di, progettiDi, type Ambito } from "./ambito.ts";
import type { CantiereRisposta } from "./contesto.ts";
import {
  associa,
  cambiaStato,
  cantieriDelProgetto,
  changeOccupato,
  creaCantiere,
  leggiCantieri,
  nonApribile,
  percorsoDi,
  progettoPerNome,
  risali,
  sessione,
  type Ambiente,
} from "./dominio.ts";
import { campi, errore422, luogo, nomeChange, Rifiuto, slugifica, STATI_FINALI } from "./modelli.ts";

const IN_LAVORAZIONE = "Il cantiere è già in lavorazione: i suoi file stanno nel repo.";

async function cantiereDi(amb: Ambiente, ambito: Ambito, id: number) {
  const c = await cantieriDi(amb.db, ambito).selectAll("cantieri").where("cantieri.id", "=", id).executeTakeFirst();
  if (!c) throw new Rifiuto(404, "Cantiere inesistente.");
  return c;
}

async function soloIdea(amb: Ambiente, ambito: Ambito, id: number) {
  const c = await cantiereDi(amb, ambito, id);
  if (c.stato !== "idea") throw new Rifiuto(409, IN_LAVORAZIONE);
  return c;
}

const nomeValido = (nome: unknown) => {
  const v = campi.nomeSemplice.safeParse(nome);
  if (!v.success) throw errore422(v.error);
  return v.data;
};

/** Slug del percorso di un figlio: quello del padre più il suo. */
const slugFiglio = (padre: { percorso_slug: string } | undefined, nome: string) => [...(padre ? padre.percorso_slug.split("/") : []), slugifica(nome)];

async function nomeLibero(amb: Ambiente, progettoId: number, slugPercorso: string[]) {
  const fratello = await cantieriDelProgetto(amb.db, progettoId).where("cantieri.percorso_slug", "=", slugPercorso.join("/")).executeTakeFirst();
  if (fratello) throw new Rifiuto(409, `Esiste già il cantiere "${await percorsoDi(amb.db, fratello.id)}".`);
  const occupato = await changeOccupato(amb.db, progettoId, slugPercorso);
  if (occupato) throw new Rifiuto(409, occupato);
}

const unoLetto = async (amb: Ambiente, ambito: Ambito, id: number) => (await leggiCantieri(amb.db, amb.config, ambito, { ids: [id] }))[0];

/** Nuova idea dalla dashboard, sotto un progetto o sotto un altro cantiere dello stesso progetto. */
export async function creaIdea(amb: Ambiente, ambito: Ambito, progettoId: number, dati: { nome?: unknown; descrizione?: unknown; padre_id?: unknown }) {
  const progetto = await progettiDi(amb.db, ambito).select("progetti.id").where("progetti.id", "=", progettoId).executeTakeFirst();
  if (!progetto) throw new Rifiuto(404, "Progetto inesistente.");
  const nome = nomeValido(dati.nome);
  const descrizione = campi.descrizione.safeParse(dati.descrizione ?? null);
  if (!descrizione.success) throw errore422(descrizione.error);
  const padre =
    dati.padre_id === undefined || dati.padre_id === null
      ? undefined
      : await cantieriDelProgetto(amb.db, progettoId).where("cantieri.id", "=", Number(dati.padre_id)).executeTakeFirst();
  if (padre === undefined && dati.padre_id !== undefined && dati.padre_id !== null) throw new Rifiuto(404, "Cantiere padre inesistente in questo progetto.");
  if (padre) {
    if (STATI_FINALI.includes(padre.stato)) throw new Rifiuto(409, `Il cantiere "${await percorsoDi(amb.db, padre.id)}" è ${padre.stato}.`);
  }
  const slugPercorso = slugFiglio(padre, nome);
  await nomeLibero(amb, progettoId, slugPercorso);
  const c = await amb.db.transaction().execute((trx) =>
    creaCantiere(trx, { progetto_id: progettoId, padre_id: padre?.id ?? null, nome, slugPercorso, descrizione: descrizione.data ?? null, stato: "idea", origine: "dashboard" }, adesso()),
  );
  return unoLetto(amb, ambito, c.id);
}

/** Nome e descrizione si cambiano solo finché il cantiere è un'idea. */
export async function modificaIdea(amb: Ambiente, ambito: Ambito, id: number, dati: { nome?: unknown; descrizione?: unknown }) {
  const c = await soloIdea(amb, ambito, id);
  const modifiche: { nome?: string; slug?: string; percorso_slug?: string; change?: string; descrizione?: string | null } = {};
  if (dati.descrizione !== undefined) {
    const d = campi.descrizione.safeParse(dati.descrizione);
    if (!d.success) throw errore422(d.error);
    modifiche.descrizione = d.data ?? null;
  }
  if (dati.nome !== undefined) {
    const nome = nomeValido(dati.nome);
    const padre = c.padre_id === null ? undefined : await cantieriDelProgetto(amb.db, c.progetto_id).where("cantieri.id", "=", c.padre_id).executeTakeFirstOrThrow();
    const slugPercorso = slugFiglio(padre, nome);
    if (slugPercorso.join("/") !== c.percorso_slug) {
      // I percorsi dei figli dipendono da questo: si rinomina solo un'idea senza figli.
      const figli = await cantieriDelProgetto(amb.db, c.progetto_id).where("cantieri.padre_id", "=", c.id).executeTakeFirst();
      if (figli) throw new Rifiuto(409, "Un'idea con figli non si rinomina.");
      await nomeLibero(amb, c.progetto_id, slugPercorso);
      Object.assign(modifiche, { slug: slugPercorso[slugPercorso.length - 1], percorso_slug: slugPercorso.join("/"), change: nomeChange(slugPercorso) });
    }
    modifiche.nome = nome;
  }
  await amb.db.updateTable("cantieri").set({ ...modifiche, aggiornato_il: adesso() }).where("id", "=", c.id).execute();
  return unoLetto(amb, ambito, c.id);
}

const NOME_FILE = /^[^/\\]+\.(md|txt)$/i;

/** Aggiunge (o sostituisce) un file .md o .txt di un'idea. */
export async function aggiungiFile(amb: Ambiente, ambito: Ambito, id: number, dati: { nome?: unknown; contenuto?: unknown }) {
  const c = await soloIdea(amb, ambito, id);
  const nome = typeof dati.nome === "string" ? dati.nome.trim() : "";
  if (!NOME_FILE.test(nome) || nome.startsWith(".")) throw new Rifiuto(422, `Il file "${nome}" non va bene: sono ammessi solo file .md e .txt.`);
  if (typeof dati.contenuto !== "string" || !dati.contenuto.isWellFormed()) throw new Rifiuto(422, `Il file "${nome}" non è testo UTF-8.`);
  const byte = Buffer.byteLength(dati.contenuto);
  if (byte > amb.config.max_file) throw new Rifiuto(422, `Il file "${nome}" supera ${amb.config.max_file} byte.`);
  const presenti = await amb.db.selectFrom("idee_file").select("nome").where("cantiere_id", "=", c.id).execute();
  if (!presenti.some((p) => p.nome === nome) && presenti.length >= amb.config.max_file_idea) {
    throw new Rifiuto(422, `Il file "${nome}" non entra: un'idea ha al massimo ${amb.config.max_file_idea} file.`);
  }
  await amb.db.transaction().execute(async (trx) => {
    await trx.deleteFrom("idee_file").where("cantiere_id", "=", c.id).where("nome", "=", nome).execute();
    await trx.insertInto("idee_file").values({ cantiere_id: c.id, nome, contenuto: dati.contenuto as string, byte, creato_il: adesso() }).execute();
    await trx.updateTable("cantieri").set({ aggiornato_il: adesso() }).where("id", "=", c.id).execute();
  });
  return { nome, byte };
}

export async function eliminaFile(amb: Ambiente, ambito: Ambito, id: number, nome: unknown) {
  const c = await soloIdea(amb, ambito, id);
  await amb.db.deleteFrom("idee_file").where("cantiere_id", "=", c.id).where("nome", "=", String(nome)).execute();
}

const corpoPresa = luogo.extend({ session_id: campi.sessionId });

/**
 * POST /api/v1/progetti/<progetto>/cantieri/<percorso>/prendi: un'idea passa ad aperto (con gli
 * antenati ancora idee) e la sessione ci entra con origine utente. Su un cantiere già aperto la
 * sessione entra e riceve gli stessi dati: la presa è idempotente.
 */
export async function prendi(amb: Ambiente, committente: Committente, nomeProgetto: string, nomi: string[], corpo: unknown) {
  const progetto = await progettoPerNome(amb.db, di(committente.id), nomeProgetto);
  if (!progetto) throw new Rifiuto(404, `Il progetto "${nomeProgetto}" non esiste.`);
  const valido = corpoPresa.safeParse(corpo);
  if (!valido.success) throw errore422(valido.error);
  const { session_id, ...luogoSessione } = valido.data;
  const c = await cantieriDelProgetto(amb.db, progetto.id).where("cantieri.percorso_slug", "=", nomi.map(slugifica).join("/")).executeTakeFirst();
  if (!c) throw new Rifiuto(404, `Il cantiere "${nomi.join("/")}" non esiste in ${progetto.nome}.`);
  const percorso = await percorsoDi(amb.db, c.id);
  if (c.stato !== "idea" && c.stato !== "aperto") throw new Rifiuto(409, nonApribile(percorso, c.stato));

  await amb.db.transaction().execute(async (trx) => {
    const ora = adesso();
    const s = await sessione(trx, committente.id, session_id, progetto.id, luogoSessione, ora);
    for (const x of await risali(trx, c.id)) if (x.stato === "idea") await cambiaStato(trx, x, "aperto", "presa", ora);
    await associa(trx, s.session_id, c.id, "utente");
  });
  const file = await amb.db.selectFrom("idee_file").select(["nome", "contenuto"]).where("cantiere_id", "=", c.id).orderBy("nome").execute();
  const cantiere: CantiereRisposta = { id: c.id, nome: c.nome, percorso, origine: "utente", stato: "aperto", change: c.change };
  return { cantiere, change: c.change, file };
}
