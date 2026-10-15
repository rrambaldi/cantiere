// Strumenti comuni ai test: server finto, ambiente isolato, esecuzione dello script come processo.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT = fileURLToPath(new URL("../bin/forgia.mjs", import.meta.url));
export const WRAPPER = fileURLToPath(new URL("../bin/forgia", import.meta.url));
export const DATI = JSON.parse(readFileSync(new URL("./dati/hook.json", import.meta.url), "utf8"));
export const TRANSCRIPT = readFileSync(new URL("./dati/transcript.jsonl", import.meta.url), "utf8");

export const RISPOSTA = {
  cantiere: { id: 1, nome: "app@main", origine: "auto", confermato: false },
  contesto: null as string | null,
  config: { modalita_resoconto: "forzato", soglia_strumenti: 3 },
};

export type Richiesta = { percorso: string; auth?: string; corpo: any };
type Rispondi = (r: Richiesta) => { codice?: number; corpo?: unknown } | undefined;

export async function serverFinto(rispondi: Rispondi = () => undefined) {
  const richieste: Richiesta[] = [];
  const srv = createServer(async (req, res) => {
    let testo = "";
    for await (const pezzo of req) testo += pezzo;
    const r = { percorso: req.url!, auth: req.headers.authorization, corpo: testo ? JSON.parse(testo) : null };
    richieste.push(r);
    const predefinito = r.percorso.endsWith("/salute") ? { ok: true, versione_contratto: 1, cliente: "prova" } : RISPOSTA;
    const { codice = 200, corpo = predefinito } = rispondi(r) ?? {};
    res.writeHead(codice, { "content-type": "application/json" }).end(JSON.stringify(corpo));
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  return {
    url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`,
    richieste,
    eventi: () => richieste.filter((r) => r.percorso === "/api/v1/eventi").map((r) => r.corpo),
    chiudi: () => new Promise((ok) => srv.close(ok)),
  };
}

// Un indirizzo su cui non ascolta nessuno.
export async function portaChiusa() {
  const s = await serverFinto();
  await s.chiudi();
  return s.url;
}

// Cartelle temporanee per config, cache, settings di Claude Code e progetto. PATH ridotto a quello
// del processo: niente CLAUDE_CODE_SESSION_ID ereditato.
export function ambiente(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "forgia-test-"));
  const progetto = join(dir, "progetto");
  mkdirSync(progetto);
  const env: Record<string, string> = {
    PATH: process.env.PATH!, HOME: dir, XDG_CONFIG_HOME: join(dir, "config"), XDG_CACHE_HOME: join(dir, "cache"),
    CLAUDE_CONFIG_DIR: join(dir, "claude"), ...extra,
  };
  return {
    dir, progetto, env,
    cache: (...p: string[]) => join(dir, "cache", "forgia", ...p),
    fileConfig: join(dir, "config", "forgia", "config.json"),
    configura(cfg: Record<string, unknown>) {
      mkdirSync(join(dir, "config", "forgia"), { recursive: true });
      writeFileSync(this.fileConfig, JSON.stringify({ token: "tok-segreto-1234", ...cfg }));
    },
    pulisci: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export type Esito = { codice: number | null; stdout: string; stderr: string; ms: number };

export function esegui(comando: string[], opz: { env: Record<string, string>; cwd?: string; input?: string }): Promise<Esito> {
  return new Promise((ok) => {
    const t0 = performance.now();
    const [file, ...args] = comando[0] === WRAPPER ? ["/bin/sh", ...comando] : [process.execPath, SCRIPT, ...comando];
    const p = spawn(file, args, { env: opz.env, cwd: opz.cwd });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (codice) => ok({ codice, stdout, stderr, ms: performance.now() - t0 }));
    p.stdin.end(opz.input ?? "");
  });
}

export const hook = (nome: string, input: object, opz: { env: Record<string, string>; cwd?: string }) =>
  esegui(["hook", nome], { ...opz, input: JSON.stringify(input) });

// Tutti i file sotto una cartella, con il contenuto.
export function fileSotto(dir: string): { percorso: string; testo: string }[] {
  let voci: string[];
  try {
    voci = readdirSync(dir);
  } catch {
    return [];
  }
  return voci.flatMap((v) => {
    const p = join(dir, v);
    return statSync(p).isDirectory() ? fileSotto(p) : [{ percorso: p, testo: readFileSync(p, "utf8") }];
  });
}
