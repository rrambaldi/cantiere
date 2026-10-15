import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { creaCommittente } from "../src/accesso.ts";
import { creaApp, type Log } from "../src/app.ts";
import { leggiConfig, type Config } from "../src/config.ts";
import { apriDb, migra } from "../src/db.ts";
import { creaProgetto } from "../src/dominio.ts";

export type Banco = Awaited<ReturnType<typeof avvia>>;

/**
 * Server vero in ascolto su una porta libera, con un database SQLite temporaneo, il committente
 * CVSTUDIO (token in `token`) e il suo progetto "app".
 */
export async function avvia(config: Partial<Config> = {}, cartellaUi?: string) {
  const dir = await mkdtemp(join(tmpdir(), "forgia-test-"));
  const database_url = `sqlite:${join(dir, "t.db")}`;
  const amb = { config: { ...leggiConfig({}), database_url, ...config }, db: await apriDb(database_url) };
  await migra(amb.db);
  const { committente, token } = await creaCommittente(amb.db, "CVSTUDIO");
  const progetto = await creaProgetto(amb.db, committente.id, "app");
  const log: Parameters<Log>[0][] = [];
  const server = creaApp(amb, (riga) => log.push(riga), cartellaUi);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    ...amb,
    dir,
    url,
    token,
    committente,
    progetto,
    log,
    /** Un altro committente con il suo token e un progetto. */
    async altroCommittente(nome = "PRIV", progetti = ["app"]) {
      const altro = await creaCommittente(amb.db, nome);
      for (const p of progetti) await creaProgetto(amb.db, altro.committente.id, p);
      return altro;
    },
    async chiudi() {
      server.closeAllConnections();
      await new Promise((ok) => server.close(ok));
      await amb.db.destroy();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function evento(tipo: string, dati: object, extra: object = {}) {
  return {
    evento_id: randomUUID(),
    ts: new Date().toISOString(),
    tipo,
    session_id: "s1",
    host: "portatile",
    cwd: "/home/u/app",
    repo: "github.com/org/app",
    branch: "main",
    progetto: "app",
    dati,
    ...extra,
  };
}

export const stop = (titolo: string | null = null) => ({ strumenti_nel_turno: 0, resoconto_inviato: false, bloccato: false, titolo });
export const apertura = (nome: string, origine = "utente", altro: object = {}) => ({ nome, descrizione: null, origine, ...altro });

export const tsFa = (secondi: number) => new Date(Date.now() - secondi * 1000).toISOString();

export async function richiesta(b: Banco, percorso: string, init: RequestInit = {}, token: string | null = b.token) {
  const r = await fetch(`${b.url}${percorso}`, {
    ...init,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...init.headers },
  });
  const testo = await r.text();
  return { status: r.status, corpo: testo ? JSON.parse(testo) : null };
}

export const invia = (b: Banco, ev: object, token?: string | null) =>
  richiesta(b, "/api/v1/eventi", { method: "POST", body: JSON.stringify(ev) }, token);

export const apri = (b: Banco, session_id: string, nome: string, origine = "utente", extra: object = {}) =>
  invia(b, evento("apri_cantiere", apertura(nome, origine), { session_id, ...extra }));

export const copia = (b: Banco, corpo: object, progetto = "app", token?: string | null) =>
  richiesta(b, `/api/v1/progetti/${progetto}/openspec`, { method: "PUT", body: JSON.stringify(corpo) }, token);

/** Copia con un change attivo e i suoi file. */
export const changeAttivo = (change: string, file: Record<string, string> = { "proposal.md": "# Proposta" }, modificato_il = new Date().toISOString()) => ({
  change,
  modificato_il,
  file: Object.entries(file).map(([percorso, contenuto]) => ({ percorso, contenuto })),
});

export const cantiere = (b: Banco, percorso_slug: string, progettoId = b.progetto.id) =>
  b.db.selectFrom("cantieri").selectAll().where("progetto_id", "=", progettoId).where("percorso_slug", "=", percorso_slug).executeTakeFirstOrThrow();

export const sessione = (b: Banco, id = "s1") => b.db.selectFrom("sessioni").selectAll().where("session_id", "=", id).executeTakeFirstOrThrow();

/** Richiesta alla dashboard, con il certificato confermato da nginx salvo diversa indicazione. */
export async function ui(b: Banco, percorso: string, init: Omit<RequestInit, "headers"> & { certificato?: boolean; headers?: Record<string, string> } = {}) {
  const { certificato = true, headers = {}, ...resto } = init;
  const scrittura: Record<string, string> = resto.method === "POST" ? { "content-type": "application/json", "x-forgia-ui": "1" } : {};
  const r = await fetch(`${b.url}${percorso}`, {
    redirect: "manual",
    ...resto,
    headers: { ...(certificato ? { "x-ssl-client-verify": "SUCCESS" } : {}), ...scrittura, ...headers },
  });
  const testo = await r.text();
  let corpo: any = testo;
  try {
    corpo = testo ? JSON.parse(testo) : null;
  } catch {}
  return { status: r.status, headers: r.headers, corpo };
}
