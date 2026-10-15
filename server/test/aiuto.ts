import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { creaCliente } from "../src/accesso.ts";
import { creaApp, type Log } from "../src/app.ts";
import { leggiConfig, type Config } from "../src/config.ts";
import { apriDb, migra } from "../src/db.ts";

export type Banco = Awaited<ReturnType<typeof avvia>>;

/** Server vero in ascolto su una porta libera, con un database SQLite temporaneo. */
export async function avvia(config: Partial<Config> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "forgia-test-"));
  const database_url = `sqlite:${join(dir, "t.db")}`;
  const amb = { config: { ...leggiConfig({}), database_url, ...config }, db: await apriDb(database_url) };
  await migra(amb.db);
  const token = await creaCliente(amb.db, "portatile");
  const log: Parameters<Log>[0][] = [];
  const server = creaApp(amb, (riga) => log.push(riga));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    ...amb,
    dir,
    url,
    token,
    log,
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
    dati,
    ...extra,
  };
}

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
