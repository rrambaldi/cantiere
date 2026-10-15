import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Kysely } from "kysely";
import { violaUnicita, type DB } from "./db.ts";
import { campi, errore422, Rifiuto } from "./modelli.ts";

export interface Committente {
  id: number;
  nome: string;
}

export const adesso = () => new Date().toISOString();
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const nuovoToken = () => randomBytes(32).toString("base64url");

/** Committente del token nell'header Authorization, o null. */
export async function autentica(db: Kysely<DB>, authorization: string | undefined): Promise<Committente | null> {
  const token = /^Bearer (\S+)$/.exec(authorization ?? "")?.[1];
  if (!token) return null;
  const hash = hashToken(token);
  const riga = await db.selectFrom("committenti").select(["id", "nome", "token_hash"]).where("token_hash", "=", hash).executeTakeFirst();
  if (!riga || !timingSafeEqual(Buffer.from(riga.token_hash), Buffer.from(hash))) return null;
  return { id: riga.id, nome: riga.nome };
}

/** Finestra fissa di un minuto per committente. Vale finché il server è un processo solo. */
export function creaRateLimit(limite: number, ora: () => number = Date.now) {
  const finestre = new Map<number, { minuto: number; richieste: number }>();
  return (committenteId: number): boolean => {
    const minuto = Math.floor(ora() / 60_000);
    const f = finestre.get(committenteId);
    if (!f || f.minuto !== minuto) {
      finestre.set(committenteId, { minuto, richieste: 1 });
      return true;
    }
    return ++f.richieste <= limite;
  };
}

export class CorpoTroppoGrande extends Error {}

/** Legge il corpo fermandosi appena supera il limite, senza tenerlo tutto in memoria. */
export async function leggiCorpo(req: IncomingMessage, massimo: number): Promise<string> {
  if (Number(req.headers["content-length"] ?? 0) > massimo) throw new CorpoTroppoGrande();
  const parti: Buffer[] = [];
  let letti = 0;
  for await (const parte of req as AsyncIterable<Buffer>) {
    letti += parte.length;
    if (letti > massimo) throw new CorpoTroppoGrande();
    parti.push(parte);
  }
  return Buffer.concat(parti).toString("utf8");
}

// --- Committenti (dashboard e CLI) --------------------------------------------------------------

/** Committente per nome, senza distinzione di maiuscole. */
export const trovaCommittente = (db: Kysely<DB>, nome: string) =>
  db.selectFrom("committenti").select(["id", "nome", "creato_il", "token_il"]).where("nome_chiave", "=", nome.trim().toLowerCase()).executeTakeFirst();

/** Crea il committente con il suo token: è l'unica volta che il token esiste in chiaro. */
export async function creaCommittente(db: Kysely<DB>, nome: string) {
  const valido = campi.committente.safeParse(nome);
  if (!valido.success) throw errore422(valido.error);
  const esistente = await trovaCommittente(db, valido.data);
  const giaUsato = () => new Rifiuto(409, `Esiste già il committente "${esistente?.nome ?? valido.data}".`);
  if (esistente) throw giaUsato();
  const token = nuovoToken();
  const ora = adesso();
  try {
    const committente = await db
      .insertInto("committenti")
      .values({ nome: valido.data, nome_chiave: valido.data.toLowerCase(), token_hash: hashToken(token), token_il: ora, creato_il: ora })
      .returning(["id", "nome", "creato_il", "token_il"])
      .executeTakeFirstOrThrow();
    return { committente, token };
  } catch (errore) {
    if (violaUnicita(errore)) throw giaUsato();
    throw errore;
  }
}

/** Token nuovo per il committente: quello vecchio smette di valere subito. */
export async function rigeneraToken(db: Kysely<DB>, committente: { id: number } | { nome: string }): Promise<string> {
  const token = nuovoToken();
  const q = db.updateTable("committenti").set({ token_hash: hashToken(token), token_il: adesso() });
  const esito = await ("id" in committente ? q.where("id", "=", committente.id) : q.where("nome_chiave", "=", committente.nome.trim().toLowerCase())).executeTakeFirst();
  if (esito.numUpdatedRows === 0n) throw new Rifiuto(404, "Committente inesistente.");
  return token;
}

export function elencaCommittenti(db: Kysely<DB>) {
  return db.selectFrom("committenti").select(["id", "nome", "creato_il", "token_il"]).orderBy("nome_chiave").execute();
}
