import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Kysely } from "kysely";
import type { DB } from "./db.ts";
import { adesso } from "./dominio.ts";

export interface Cliente {
  id: number;
  nome: string;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Cliente attivo del token nell'header Authorization, o null. */
export async function autentica(db: Kysely<DB>, authorization: string | undefined): Promise<Cliente | null> {
  const token = /^Bearer (\S+)$/.exec(authorization ?? "")?.[1];
  if (!token) return null;
  const hash = hashToken(token);
  const riga = await db
    .selectFrom("clienti")
    .select(["id", "nome", "token_hash"])
    .where("token_hash", "=", hash)
    .where("revocato_il", "is", null)
    .executeTakeFirst();
  if (!riga || !timingSafeEqual(Buffer.from(riga.token_hash), Buffer.from(hash))) return null;
  return { id: riga.id, nome: riga.nome };
}

/** Finestra fissa di un minuto per cliente. Vale finché il server è un processo solo. */
export function creaRateLimit(limite: number, ora: () => number = Date.now) {
  const finestre = new Map<number, { minuto: number; richieste: number }>();
  return (clienteId: number): boolean => {
    const minuto = Math.floor(ora() / 60_000);
    const f = finestre.get(clienteId);
    if (!f || f.minuto !== minuto) {
      finestre.set(clienteId, { minuto, richieste: 1 });
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

// --- Gestione dei clienti (CLI) -----------------------------------------------------------------

/** Crea il cliente e restituisce il suo token: è l'unica volta che esiste in chiaro. */
export async function creaCliente(db: Kysely<DB>, nome: string): Promise<string> {
  const attivo = await db.selectFrom("clienti").select("id").where("nome", "=", nome).where("revocato_il", "is", null).executeTakeFirst();
  if (attivo) throw new Error(`Esiste già un cliente attivo di nome "${nome}": revocalo prima di crearne un altro.`);
  const token = randomBytes(32).toString("base64url");
  await db.insertInto("clienti").values({ nome, token_hash: hashToken(token), creato_il: adesso(), revocato_il: null }).execute();
  return token;
}

export function elencaClienti(db: Kysely<DB>) {
  return db.selectFrom("clienti").select(["nome", "creato_il", "revocato_il"]).orderBy("id").execute();
}

export async function revocaCliente(db: Kysely<DB>, nome: string): Promise<void> {
  const esito = await db
    .updateTable("clienti")
    .set({ revocato_il: adesso() })
    .where("nome", "=", nome)
    .where("revocato_il", "is", null)
    .executeTakeFirst();
  if (esito.numUpdatedRows === 0n) throw new Error(`Nessun cliente attivo di nome "${nome}".`);
}
