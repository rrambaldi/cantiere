// Strumenti comuni ai test: server finto, ambiente isolato, esecuzione dello script come processo.
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT = fileURLToPath(new URL("../bin/forgia.mjs", import.meta.url));
export const WRAPPER = fileURLToPath(new URL("../bin/forgia", import.meta.url));
export const DATI = JSON.parse(readFileSync(new URL("./dati/hook.json", import.meta.url), "utf8"));
export const TRANSCRIPT = readFileSync(new URL("./dati/transcript.jsonl", import.meta.url), "utf8");

export const TOKEN = "tok-segreto-1234";
export const RISPOSTA = {
  progetto: "prova",
  cantiere: { id: 1, nome: "pdfconverter", percorso: "pdfconverter", origine: "utente", stato: "aperto", change: "pdfconverter" },
  contesto: null as string | null,
  config: { modalita_resoconto: "forzato", soglia_strumenti: 3 },
};
export const PROGETTI = { progetti: [{ id: 1, nome: "prova", slug: "prova", creato_il: "2026-10-15T08:00:00.000Z", cantieri: {} }] };

export type Richiesta = { metodo: string; percorso: string; auth?: string; corpo: any };
// html: una pagina al posto del JSON, come quella di un proxy davanti al server.
type Rispondi = (r: Richiesta) => { codice?: number; corpo?: unknown; html?: string } | undefined;

// La copia dei change: il percorso può avere ?session_id=.
const copia = (r: Richiesta) => new URL(r.percorso, "http://x").pathname.endsWith("/openspec");

export async function serverFinto(rispondi: Rispondi = () => undefined) {
  const richieste: Richiesta[] = [];
  const srv = createServer(async (req, res) => {
    let testo = "";
    for await (const pezzo of req) testo += pezzo;
    const r = { metodo: req.method!, percorso: req.url!, auth: req.headers.authorization, corpo: testo ? JSON.parse(testo) : null };
    richieste.push(r);
    // Le risposte di base del Contratto v2; ogni test cambia quelle che gli servono.
    const predefinito = r.percorso.endsWith("/salute") ? { ok: true, versione_contratto: 2, cliente: "PRIV" }
      : r.percorso === "/api/v1/progetti" ? (r.metodo === "POST" ? { progetto: { id: 2, nome: r.corpo.nome, slug: r.corpo.nome } } : PROGETTI)
      : copia(r) ? { cantieri: [] }
      : RISPOSTA;
    const { codice = 200, corpo = predefinito, html } = rispondi(r) ?? {};
    if (html !== undefined) res.writeHead(codice, { "content-type": "text/html" }).end(html);
    else res.writeHead(codice, { "content-type": "application/json" }).end(JSON.stringify(corpo));
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  return {
    url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`,
    richieste,
    eventi: () => richieste.filter((r) => r.percorso === "/api/v1/eventi").map((r) => r.corpo),
    copie: () => richieste.filter(copia),
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "forgia-test-")));
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
    // Config v2 con un'area sulla cartella del progetto; `aree` le sostituisce tutte. `comandi` va sull'area,
    // gli altri campi sono le impostazioni generali.
    configura(cfg: Record<string, unknown> = {}) {
      const { url, token = TOKEN, committente = "PRIV", progetto: nome = "prova", cartella = progetto, mcp_registrato_il = null, comandi, aree, ...generale } = cfg;
      mkdirSync(join(dir, "config", "forgia"), { recursive: true });
      writeFileSync(this.fileConfig, JSON.stringify({ ...generale, aree: aree ?? [{ cartella, url, token, committente, progetto: nome, mcp_registrato_il, comandi }] }));
    },
    pulisci: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// Un eseguibile finto nel PATH dell'ambiente: registra "<cwd>|<argomenti>" e poi esegue `corpo`.
export function finto(amb: ReturnType<typeof ambiente>, nome: string, corpo = "") {
  const bin = join(amb.dir, "bin");
  const log = join(amb.dir, `${nome}.log`);
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, nome), `#!/bin/sh\necho "$(pwd)|$*" >> "${log}"\n${corpo}\n`);
  chmodSync(join(bin, nome), 0o755);
  if (!amb.env.PATH.startsWith(`${bin}:`)) amb.env.PATH = `${bin}:${amb.env.PATH}`;
  return () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
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
