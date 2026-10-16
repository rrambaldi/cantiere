// cantiere forgia: hook di Claude Code e comandi `forgia ...`. Solo moduli interni di Node.
// Il contratto con il server è in docs/contratto-v2.md. Si spedisce compilato in forgia.mjs
// (npx tsc -p plugin/tsconfig.build.json): il type stripping a ogni hook costava ~280 ms.
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFileSync, closeSync, copyFileSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync,
  readFileSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const NOME = "forgia";
export const NOME_VISIBILE = "cantiere forgia";
const VERSIONE_CONTRATTO = 2;
const TIMEOUT_HTTP = 1500;
const TIMEOUT_COMANDO = 5000;
const TIMEOUT_GIT = 1000;
const MAX_CODA = 500;
const SCADENZA_ATTESA = 10 * 60_000;
const VITA_SESSIONE = 7 * 24 * 3600_000;
const SORGENTI = ["startup", "resume", "clear", "compact"];
const MAX_FILE = 256 * 1024; // come max_file del server: un file più grande renderebbe la copia invalida
const MAX_TITOLO = 200;
const MAX_FINESTRA_TITOLO = 1 << 24;
const RE_CHANGE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RE_ARCHIVIATO = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const FILE_CHANGE = new Set([".openspec.yaml", "proposal.md", "design.md", "tasks.md"]);
const STATI_TODO = ["pending", "in_progress", "completed", "deleted"];
const RIFIUTI_DEFINITIVI = [409, 413, 422];
const OSCURATI = new Set(["prompt", "last_assistant_message", "token"]);
export const RE_CANTIERE = /^\/(\S+:)?cantiere(\s|$)/;
// Prime parole di /cantiere che gestisce il comando, non l'hook. `chiudi` e `server` erano di v1:
// il comando spiega cosa usare adesso.
const RISERVATE = ["prendi", "collega", "chiudi", "server", "stato", "permessi", "on", "off"];
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), NOME);
const NON_COLLEGATA = `questa cartella non è collegata a ${NOME_VISIBILE}: lancia /cantiere collega <progetto> <url>`;

type Modalita = "forzato" | "leggero" | "off";
// Una cartella di sorgenti (con le sottocartelle) legata a un progetto e al token del suo committente.
export type Area = {
  cartella: string; url: string; token: string; committente: string; progetto: string; mcp_registrato_il: string | null;
};
type Generale = { abilitato: boolean; nome_server_mcp: string; modalita_resoconto: Modalita | null; aree: Area[] };
// La configurazione che vale per una sessione: la sua area più le impostazioni generali.
export type Config = Area & { nome_server_mcp: string; modalita_resoconto: Modalita | null };
type Cantiere = { id: number; nome: string; percorso: string; origine: string; stato: string; change: string };
type Risposta = {
  progetto: string; cantiere: Cantiere | null; contesto: string | null;
  config: { modalita_resoconto: Modalita; soglia_strumenti: number };
};
type Consegna = { codice: number; risposta: Risposta | null; corpo: unknown };
type Evento = {
  evento_id: string; ts: string; tipo: string; session_id: string; host: string; cwd: string;
  repo: string | null; branch: string | null; progetto: string; dati: Record<string, unknown>;
};
// In coda c'è la cartella dell'area, mai il token: all'invio si rileggono URL e token attuali.
type InCoda = { cartella: string; evento: Evento };
type VoceTodo = { testo: string; stato: string };
type Sessione = {
  titolo_impostato?: string; primo_visto: string; cwd: string; avvio_reale_il?: string; ultimo_evento_il?: string;
  cantiere?: Cantiere | null; config?: Risposta["config"]; contesto_pendente?: string;
  todo?: Record<string, VoceTodo>;
};
type Attesa = { tipo: string; dati: Record<string, unknown>; creato_il: string };
type Git = { repo: string | null; branch: string | null };
type Contesto = { sid: string; cwd: string; cfg: Config; git?: Git };
type Conteggio = { strumenti: number; resoconto: boolean };
// Input degli hook: la forma la decide Claude Code, si controlla campo per campo.
type Input = any;

class Errore extends Error {}
const errore = (msg: string): never => { throw new Errore(msg); };
const assente = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";
const adesso = () => new Date().toISOString();

// ---- percorsi, file e config

const radice = (xdg: string, win: string | undefined, def: string) =>
  join(process.env[xdg] || (process.platform === "win32" && win) || join(homedir(), def), NOME);
const fileConfig = () => join(radice("XDG_CONFIG_HOME", process.env.APPDATA, ".config"), "config.json");
const cache = (...p: string[]) => join(radice("XDG_CACHE_HOME", process.env.LOCALAPPDATA, ".cache"), ...p);

function leggiJson<T>(p: string): T | null {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    if (assente(e)) return null;
    throw e;
  }
}

function scriviJson(p: string, v: unknown, mode?: number) {
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2), { mode });
  renameSync(tmp, p);
}

// Una config di v1 (url e token, senza aree) vale come nessuna area: si ricollega con /cantiere collega.
export function leggiGenerale(): Generale {
  const f = leggiJson<Partial<Generale>>(fileConfig()) ?? {};
  return {
    abilitato: f.abilitato ?? true, nome_server_mcp: f.nome_server_mcp ?? NOME,
    modalita_resoconto: f.modalita_resoconto ?? null, aree: Array.isArray(f.aree) ? f.aree : [],
  };
}

function salvaArea(gen: Generale, area: Area) {
  scriviJson(fileConfig(), { ...gen, aree: [...gen.aree.filter((a) => a.cartella !== area.cartella), area] }, 0o600);
}

const reale = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p); // cartella sparita: si confronta il percorso così com'è
  }
};

// L'area la cui cartella contiene la cwd, la più specifica. Confronto per segmenti: ~/lavori/pok non
// sta dentro ~/lavori/poker.
export function areaDi(aree: Area[], cwd: string): Area | null {
  const qui = reale(cwd);
  const dentro = (a: Area) => qui === a.cartella || qui.startsWith(a.cartella.endsWith(sep) ? a.cartella : a.cartella + sep);
  return aree.filter(dentro).sort((a, b) => b.cartella.length - a.cartella.length)[0] ?? null;
}

const configDi = (gen: Generale, area: Area): Config =>
  ({ ...area, nome_server_mcp: gen.nome_server_mcp, modalita_resoconto: gen.modalita_resoconto });

function areaCorrente(): Config {
  const gen = leggiGenerale();
  return configDi(gen, areaDi(gen.aree, process.cwd()) ?? errore(NON_COLLEGATA));
}

// Come lo slug del server (Contratto v2), per confrontare i nomi dei progetti.
export const slug = (s: string) =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const chiaveCartella = (p: string) => createHash("sha256").update(resolve(p)).digest("hex").slice(0, 16);

function debug(...voci: unknown[]) {
  if (process.env.FORGIA_DEBUG !== "1") return;
  mkdirSync(cache(), { recursive: true });
  const riga = JSON.stringify({ ts: adesso(), voci }, (k, v) => (OSCURATI.has(k) ? "<oscurato>" : v));
  appendFileSync(cache("debug.log"), riga + "\n");
}

// ---- git e repo

function git(cwd: string, ...args: string[]): string | null {
  try {
    const out = execFileSync("git", ["-C", cwd, ...args], {
      timeout: TIMEOUT_GIT, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8",
    });
    return out.trim() || null;
  } catch {
    return null; // niente git, niente repo o niente remote: il contratto vuole null
  }
}

export function normalizzaRepo(url: string): string | null {
  const s = url.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const scp = /^[^@/]+@([^:/]+):(.+)$/.exec(s);
  if (scp && !s.includes("://")) return `${scp[1].toLowerCase()}/${scp[2]}`;
  try {
    const u = new URL(s);
    return u.hostname ? u.hostname + u.pathname.replace(/\/+$/, "") : null;
  } catch {
    return null; // percorso locale o URL che non è un remote di rete
  }
}

// Senza lanciare git: è nel percorso caldo dell'hook sincrono del prompt.
function radiceGit(cwd: string): string | null {
  for (let d = resolve(cwd); ; d = dirname(d)) {
    if (existsSync(join(d, ".git"))) return d;
    if (dirname(d) === d) return null;
  }
}

// Lanciato solo quando parte un evento.
function leggiGit(cwd: string): Git {
  if (!radiceGit(cwd)) return { repo: null, branch: null };
  const remoto = git(cwd, "config", "--get", "remote.origin.url");
  return { branch: git(cwd, "branch", "--show-current"), repo: remoto && normalizzaRepo(remoto) };
}

const progettoEscluso = (cwd: string) => [cwd, radiceGit(cwd)].some((d) => d && existsSync(join(d, ".forgia-off")));

// ---- sessioni in cache

const fileSessione = (sid: string) => cache("sessioni", `${sid}.json`);
const leggiSessione = (sid: string) => leggiJson<Sessione>(fileSessione(sid));

function aggiornaSessione(sid: string, cambia: (s: Sessione) => void) {
  const s = leggiSessione(sid);
  if (!s) return;
  cambia(s);
  scriviJson(fileSessione(sid), s);
}

function pulisciSessioni() {
  const dir = cache("sessioni");
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    const modificato = statSync(join(dir, f), { throwIfNoEntry: false })?.mtimeMs; // un altro hook può averlo appena tolto
    if (modificato && Date.now() - modificato > VITA_SESSIONE) rmSync(join(dir, f), { force: true });
  }
}

// Il percorso dal primo livello del progetto (padre/figlio); null per il lavoro diretto.
const nomeCantiere = (c: Cantiere | null | undefined) => c?.percorso ?? null;

export function ultimaSessione(cwd: string) {
  const dir = cache("sessioni");
  if (!existsSync(dir)) return null;
  const qui = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ id: f.slice(0, -5), s: leggiJson<Sessione>(join(dir, f)) }))
    .filter((x): x is { id: string; s: Sessione } => x.s?.cwd === resolve(cwd))
    .map(({ id, s }) => ({ session_id: id, cantiere: nomeCantiere(s.cantiere), visto_il: s.ultimo_evento_il ?? s.primo_visto }))
    .sort((a, b) => b.visto_il.localeCompare(a.visto_il));
  return qui[0] ?? null;
}

// ---- eventi, coda e invio

function evento(c: Contesto, tipo: string, dati: Record<string, unknown>): Evento {
  c.git ??= leggiGit(c.cwd);
  return {
    evento_id: randomUUID(), ts: adesso(), tipo, session_id: c.sid, host: hostname(), cwd: c.cwd,
    repo: c.git.repo, branch: c.git.branch, progetto: c.cfg.progetto, dati,
  };
}

const fileInCoda = (ev: Evento) => cache("coda", `${String(Date.parse(ev.ts)).padStart(15, "0")}-${ev.evento_id}.json`);
const inCoda = () => (existsSync(cache("coda")) ? readdirSync(cache("coda")).filter((f) => f.endsWith(".json")).sort() : []);

function accoda(cartella: string, ev: Evento) {
  scriviJson(fileInCoda(ev), { cartella, evento: ev } satisfies InCoda);
  const file = inCoda();
  for (const f of file.slice(0, Math.max(0, file.length - MAX_CODA))) rmSync(cache("coda", f), { force: true });
}

async function posta(cfg: Config, ev: Evento): Promise<Consegna | null> {
  try {
    const r = await fetch(`${cfg.url}/api/v1/eventi`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify(ev),
      signal: AbortSignal.timeout(TIMEOUT_HTTP),
    });
    const corpo = await r.json().catch(() => null);
    return { codice: r.status, risposta: r.ok ? corpo : null, corpo };
  } catch {
    return null; // rete giù o timeout: l'evento resta in coda
  }
}

// Manda un evento già in coda. Lo toglie se il server l'ha accettato o rifiutato per sempre;
// null vuol dire che resta in coda.
async function consegna(cfg: Config, ev: Evento, inietta: boolean): Promise<Consegna | null> {
  const r = await posta(cfg, ev);
  debug("risposta", ev.tipo, r);
  if (!r || !(r.codice < 300 || RIFIUTI_DEFINITIVI.includes(r.codice))) return null;
  rmSync(fileInCoda(ev), { force: true });
  if (r.risposta) registraRisposta(ev, r.risposta, inietta);
  return r;
}

function registraRisposta(ev: Evento, r: Risposta, inietta: boolean) {
  aggiornaSessione(ev.session_id, (s) => {
    s.cantiere = r.cantiere;
    s.config = r.config;
    s.ultimo_evento_il = ev.ts;
    // Il contesto che nessuno inietta adesso aspetta il prossimo prompt.
    if (!inietta && r.contesto && (ev.tipo === "session_start" || ev.tipo === "prompt")) {
      s.contesto_pendente = [s.contesto_pendente, r.contesto].filter(Boolean).join("\n");
    }
  });
}

// Prima l'evento nuovo, poi il resto della coda in ordine, solo se il server risponde e con un
// tetto di tempo: un hook sincrono non resta appeso a svuotare una coda lunga. Ogni evento in coda
// parte con URL e token della sua area; quello di un'area che non c'è più si scarta.
async function invia(c: Contesto, ev: Evento, inietta = false): Promise<Consegna | null> {
  accoda(c.cfg.cartella, ev);
  const r = await consegna(c.cfg, ev, inietta);
  if (!r) return null;
  const fine = Date.now() + TIMEOUT_HTTP;
  const aree = leggiGenerale().aree;
  for (const f of inCoda()) {
    const voce = leggiJson<Partial<InCoda>>(cache("coda", f));
    const area = voce?.evento && aree.find((a) => a.cartella === voce.cartella);
    if (!voce?.evento || !area) {
      rmSync(cache("coda", f), { force: true }); // area cancellata, o evento di v1 senza area
      continue;
    }
    if (Date.now() > fine || !(await consegna({ ...c.cfg, ...area }, voce.evento, false))) break;
  }
  return r;
}

const fileAttesa = (cwd: string) => cache("attesa", `${chiaveCartella(cwd)}.json`);

function prendiAttesa(cwd: string): Attesa | null {
  const p = fileAttesa(cwd);
  const mia = `${p}.${process.pid}`;
  try {
    renameSync(p, mia); // la prende un hook solo
  } catch (e) {
    if (assente(e)) return null;
    throw e;
  }
  const op = leggiJson<Attesa>(mia);
  rmSync(mia, { force: true });
  return op && Date.now() - Date.parse(op.creato_il) < SCADENZA_ATTESA ? op : null;
}

// Sessione mai vista: prima un session_start tardivo. Poi l'eventuale operazione in attesa.
async function preliminari(c: Contesto) {
  if (!leggiSessione(c.sid)) {
    scriviJson(fileSessione(c.sid), { primo_visto: adesso(), cwd: resolve(c.cwd) });
    await invia(c, evento(c, "session_start", { source: "tardivo" }));
  }
  const op = prendiAttesa(c.cwd);
  if (op) await invia(c, evento(c, op.tipo, op.dati));
}

// ---- logica degli hook

export type Comando = { op: null } | { op: "apri"; nome: string; padre: string | null; descrizione: string | null };

export function riconosci(prompt: string): Comando | null {
  const testo = prompt.trimStart();
  const m = RE_CANTIERE.exec(testo);
  if (!m) return null;
  const args = testo.slice(m[0].length).trim();
  const [primo = ""] = args.split(/\s+/);
  if (!primo || RISERVATE.includes(primo)) return { op: null };
  const d = /^(.+?)\s+(?:—|--)\s+(.+)$/s.exec(args);
  // Il nome può essere un percorso padre/figlio: lo risolve il server.
  const p = /(?:^|\s)--padre\s+(\S+)/.exec(d ? d[1] : args);
  const nome = (d ? d[1] : args).replace(p?.[0] ?? "", "").trim();
  return nome ? { op: "apri", nome, padre: p?.[1] ?? null, descrizione: d ? d[2] : null } : { op: null };
}

const datiApertura = (cmd: Exclude<Comando, { op: null }>) =>
  ({ nome: cmd.nome, descrizione: cmd.descrizione, origine: "utente", padre: cmd.padre });

// Il motivo di un 409 (precedenza, cantiere sospeso o chiuso, idea, nome di change preso), dal corpo del server.
const motivoRifiuto = (r: Consegna) => (r.corpo as { errore?: unknown } | null)?.errore;

export function datiTodo(strumento: string, inp: Input, ris: Input, noti: Record<string, VoceTodo>) {
  const valida = (v: { testo: unknown; stato: unknown }) => typeof v.testo === "string" && STATI_TODO.includes(v.stato as string);
  if (strumento === "TodoWrite") {
    const todos = Array.isArray(inp?.todos) ? inp.todos.map((t: Input) => ({ id: null, testo: t?.content, stato: t?.status })) : null;
    return todos?.every(valida) ? { dati: { strumento, completo: true, todos }, noti } : null;
  }
  const id = strumento === "TaskCreate" ? ris?.task?.id : strumento === "TaskUpdate" ? inp?.taskId : undefined;
  if (typeof id !== "string" && typeof id !== "number") return null;
  const prima = noti[id] ?? { testo: "", stato: "pending" };
  const voce = { testo: inp?.subject ?? prima.testo, stato: inp?.status ?? prima.stato };
  if (!valida(voce)) return null;
  return { dati: { strumento, completo: false, todos: [{ id: String(id), ...voce }] }, noti: { ...noti, [id]: voce } };
}

const esclusoDalConteggio = (nome: string, server: string) =>
  nome === "TodoWrite" || nome.startsWith("Task") || nome.startsWith(`mcp__${server}__`);

// Conta i tool del turno dalla fine del transcript fino all'ultimo messaggio vero dell'utente.
function contaRighe(righe: string[], server: string): { trovato: boolean; conteggio: Conteggio } {
  const conteggio = { strumenti: 0, resoconto: false };
  for (let i = righe.length - 1; i >= 0; i--) {
    if (!righe[i].trim()) continue;
    const r = JSON.parse(righe[i]);
    const c = r.message?.content;
    if (r.isSidechain) continue;
    if (r.type === "user" && !r.isMeta) {
      if (typeof c === "string") return { trovato: true, conteggio };
      if (!Array.isArray(c)) throw new Error("messaggio utente di forma inattesa");
      if (!c.every((b) => b?.type === "tool_result")) return { trovato: true, conteggio };
    } else if (r.type === "assistant") {
      if (!Array.isArray(c)) throw new Error("messaggio assistant di forma inattesa");
      for (const b of c) {
        if (b?.type !== "tool_use") continue;
        if (typeof b.name !== "string") throw new Error("tool_use senza nome");
        if (b.name === `mcp__${server}__aggiorna_stato`) conteggio.resoconto = true;
        if (!esclusoDalConteggio(b.name, server)) conteggio.strumenti++;
      }
    }
  }
  return { trovato: false, conteggio };
}

// Legge il transcript dalla fine, con una finestra che cresce finché trova l'inizio del turno.
export function contaTurno(percorso: string, server: string): Conteggio | null {
  try {
    const fd = openSync(percorso, "r");
    try {
      const dim = fstatSync(fd).size;
      for (let finestra = 1 << 18; ; finestra *= 4) {
        const da = Math.max(0, dim - finestra);
        const buf = Buffer.alloc(dim - da);
        readSync(fd, buf, 0, buf.length, da);
        const righe = buf.toString("utf8").split("\n");
        const r = contaRighe(da > 0 ? righe.slice(1) : righe, server);
        if (r.trovato || da === 0) return r.conteggio;
      }
    } finally {
      closeSync(fd);
    }
  } catch {
    return null; // transcript assente, troncato o di forma inattesa: conteggio non affidabile
  }
}

// Il titolo della sessione: l'ultimo `custom-title` (da /rename) se c'è, altrimenti l'ultimo
// `ai-title`. Dopo un /rename Claude Code ripete `custom-title` lungo la sessione, quindi basta
// leggere la coda del file, a finestre crescenti fino a un tetto. Formato interno: ogni sorpresa è null.
export function titoloSessione(percorso: unknown): string | null {
  if (typeof percorso !== "string") return null;
  try {
    const fd = openSync(percorso, "r");
    try {
      const dim = fstatSync(fd).size;
      for (let finestra = 1 << 18; ; finestra *= 4) {
        const da = Math.max(0, dim - finestra);
        const buf = Buffer.alloc(dim - da);
        readSync(fd, buf, 0, buf.length, da);
        const righe = buf.toString("utf8").split("\n");
        let generato: string | null = null;
        for (let i = righe.length - 1; i >= (da > 0 ? 1 : 0); i--) {
          if (!righe[i].includes("-title")) continue;
          let r: Input;
          try {
            r = JSON.parse(righe[i]);
          } catch {
            continue; // riga scritta a metà: non è un titolo
          }
          if (r?.type === "custom-title" && typeof r.customTitle === "string" && r.customTitle) return r.customTitle.slice(0, MAX_TITOLO);
          if (r?.type === "ai-title" && typeof r.aiTitle === "string" && r.aiTitle) generato ??= r.aiTitle;
        }
        if (da === 0 || finestra >= MAX_FINESTRA_TITOLO) return generato?.slice(0, MAX_TITOLO) ?? null;
      }
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

// ---- copia dei change OpenSpec (D8 del design)

// Percorsi relativi (con `/`) dei file sotto una cartella; i link simbolici non si seguono.
function elenca(dir: string, rel = ""): string[] {
  return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((v) => {
    const p = rel ? `${rel}/${v.name}` : v.name;
    return v.isDirectory() ? elenca(dir, p) : v.isFile() ? [p] : [];
  });
}

const ammesso = (p: string) => FILE_CHANGE.has(p) || /^specs\/.+\.md$/.test(p) || /^idee\/.+\.(md|txt)$/.test(p);

// Il corpo di PUT /api/v1/progetti/<p>/openspec: change attivi con i file ammessi e la loro ultima
// modifica, e i nomi degli archiviati. Null se l'area non ha openspec/changes/.
// File ammessi di una cartella di change, con l'ultima modifica tra loro e la cartella.
function leggiChange(radice: string) {
  let ultima = statSync(radice).mtimeMs;
  const file = elenca(radice).filter(ammesso).sort().flatMap((percorso) => {
    const st = statSync(join(radice, percorso));
    if (st.size > MAX_FILE) return [];
    ultima = Math.max(ultima, st.mtimeMs);
    return [{ percorso, contenuto: readFileSync(join(radice, percorso), "utf8") }];
  });
  return { file, modificato_il: new Date(ultima).toISOString() };
}

// Degli archiviati si mandano anche i file (specifiche, esito), dal più recente, finché stanno nel
// budget: il corpo non deve superare max_openspec del server (2 MB).
const BUDGET_ARCHIVIATI = 1_000_000;

export function copiaChange(cartella: string) {
  const dir = join(cartella, "openspec", "changes");
  if (!existsSync(dir)) return null;
  const attivi = readdirSync(dir, { withFileTypes: true })
    .filter((v) => v.isDirectory() && v.name !== "archive" && RE_CHANGE.test(v.name))
    .map((v) => v.name)
    .sort()
    .map((change) => ({ change, ...leggiChange(join(dir, change)) }));
  const archivio = join(dir, "archive");
  let budget = BUDGET_ARCHIVIATI;
  const archiviati = (existsSync(archivio) ? readdirSync(archivio).sort().reverse() : []).flatMap((n) => {
    const m = RE_ARCHIVIATO.exec(n);
    if (!m) return [];
    const { file } = leggiChange(join(archivio, n));
    const peso = file.reduce((somma, f) => somma + Buffer.byteLength(f.contenuto), 0);
    if (peso > budget) return [{ change: m[2], archiviato_il: m[1] }];
    budget -= peso;
    return [{ change: m[2], archiviato_il: m[1], file }];
  });
  return { attivi, archiviati: archiviati.reverse() };
}

export function decidiBlocco(p: {
  attivo: boolean; conteggio: Conteggio | null; modalita: Modalita; soglia: number;
  avvio?: string; registrato: string | null;
}): boolean {
  return !p.attivo && !!p.conteggio && p.modalita === "forzato" && p.conteggio.strumenti >= p.soglia &&
    !p.conteggio.resoconto && !!p.avvio && !!p.registrato && p.avvio > p.registrato;
}

// sessionTitle fa come /rename. Si manda solo quando "progetto · cantiere" cambia, così un /rename
// fatto a mano dura fino al cambio di cantiere.
function titoloCantiere(c: Contesto): string | undefined {
  const cantiere = leggiSessione(c.sid)?.cantiere;
  if (!cantiere) return;
  const titolo = `${c.cfg.progetto} · ${cantiere.percorso}`.slice(0, MAX_TITOLO);
  if (leggiSessione(c.sid)?.titolo_impostato === titolo) return;
  aggiornaSessione(c.sid, (s) => (s.titolo_impostato = titolo));
  return titolo;
}

const contestoHook = (hookEventName: string, additionalContext?: string | null, sessionTitle?: string) => {
  if (!additionalContext && !sessionTitle) return;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: additionalContext || undefined, sessionTitle } }));
};

function avvisaSenzaAree() {
  const oggi = adesso().slice(0, 10);
  if (leggiJson<string>(cache("avviso.json")) === oggi) return;
  scriviJson(cache("avviso.json"), oggi);
  console.log(JSON.stringify({ systemMessage: `${NOME_VISIBILE}: nessuna cartella collegata, lancia /cantiere collega <progetto>` }));
}

const HOOK: Record<string, (c: Contesto, input: Input) => Promise<void>> = {
  async session_start(c, input) {
    const source = SORGENTI.includes(input.source) ? input.source : "resume";
    const s = leggiSessione(c.sid) ?? { primo_visto: adesso(), cwd: resolve(c.cwd) };
    if (source === "startup" || source === "resume") s.avvio_reale_il = adesso();
    scriviJson(fileSessione(c.sid), s);
    const r = await invia(c, evento(c, "session_start", { source }), true);
    await preliminari(c);
    const contesto = r ? r.risposta?.contesto : `[${NOME}] session_id=${c.sid} (server non raggiungibile)`;
    if (contesto) contestoHook("SessionStart", contesto);
  },

  // Sincrono: gestisce /cantiere, altrimenti inietta il contesto pendente senza rete.
  async prompt(c, input) {
    const cmd = typeof input.prompt === "string" ? riconosci(input.prompt) : null;
    if (cmd) {
      if (!cmd.op) return;
      await preliminari(c);
      const r = await invia(c, evento(c, "apri_cantiere", datiApertura(cmd)), true);
      const motivo = r?.codice === 409 && motivoRifiuto(r);
      const contesto = typeof motivo === "string"
        ? `[${NOME}] Comando /cantiere gestito: ${motivo} Rispondi all'utente con una sola riga.`
        : r?.risposta?.contesto;
      contestoHook("UserPromptSubmit", contesto, titoloCantiere(c));
      return;
    }
    const pendente = leggiSessione(c.sid)?.contesto_pendente;
    if (pendente) aggiornaSessione(c.sid, (s) => delete s.contesto_pendente);
    contestoHook("UserPromptSubmit", pendente, titoloCantiere(c));
  },

  async prompt_invio(c, input) {
    if (typeof input.prompt === "string" && riconosci(input.prompt)) return;
    await preliminari(c);
    await invia(c, evento(c, "prompt", {}));
  },

  async todo(c, input) {
    await preliminari(c);
    const t = datiTodo(input.tool_name, input.tool_input, input.tool_response, leggiSessione(c.sid)?.todo ?? {});
    if (!t) return;
    aggiornaSessione(c.sid, (s) => (s.todo = t.noti));
    await invia(c, evento(c, "todo", t.dati));
  },

  async stop(c, input) {
    await preliminari(c);
    const s = leggiSessione(c.sid);
    const conteggio = typeof input.transcript_path === "string" ? contaTurno(input.transcript_path, c.cfg.nome_server_mcp) : null;
    const bloccato = decidiBlocco({
      attivo: input.stop_hook_active === true,
      conteggio,
      modalita: c.cfg.modalita_resoconto ?? s?.config?.modalita_resoconto ?? "forzato",
      soglia: s?.config?.soglia_strumenti ?? 3,
      avvio: s?.avvio_reale_il,
      registrato: c.cfg.mcp_registrato_il,
    });
    await invia(c, evento(c, "stop", {
      strumenti_nel_turno: conteggio?.strumenti ?? 0, resoconto_inviato: conteggio?.resoconto ?? false, bloccato,
      titolo: titoloSessione(input.transcript_path),
    }));
    if (bloccato) {
      console.log(JSON.stringify({
        decision: "block",
        reason: `[${NOME}] Prima di chiudere chiama aggiorna_stato (session_id=${c.sid}): fatto, prossimo, bloccato_da in frasi brevi. Poi termina senza ripetere la risposta.`,
      }));
    }
  },

  async session_end(c, input) {
    await preliminari(c);
    await invia(c, evento(c, "session_end", { reason: String(input.reason ?? "other"), titolo: titoloSessione(input.transcript_path) }));
  },

  // Asincrono, accanto allo Stop: manda la copia dei change solo se è cambiata dall'ultimo invio.
  // Niente coda: è uno snapshot, e il prossimo Stop la rimanda intera.
  async copia(c) {
    const corpo = copiaChange(c.cfg.cartella);
    if (!corpo) return;
    const testo = JSON.stringify(corpo);
    const hash = createHash("sha256").update(`${c.cfg.url} ${c.cfg.progetto} ${testo}`).digest("hex");
    const ultimo = cache("copie", `${chiaveCartella(c.cfg.cartella)}.json`);
    if (leggiJson<string>(ultimo) === hash) return;
    try {
      const r = await fetch(`${c.cfg.url}/api/v1/progetti/${encodeURIComponent(c.cfg.progetto)}/openspec`, {
        method: "PUT",
        headers: { authorization: `Bearer ${c.cfg.token}`, "content-type": "application/json" },
        body: testo,
        signal: AbortSignal.timeout(TIMEOUT_COMANDO),
      });
      debug("copia", r.status);
      // Un rifiuto definitivo non si ripete finché la copia non cambia.
      if (r.ok || RIFIUTI_DEFINITIVI.includes(r.status)) scriviJson(ultimo, hash);
    } catch {
      // server giù: la copia riparte al prossimo Stop
    }
  },
};

async function hook(nome: string) {
  if (process.env.FORGIA_DISABLED === "1" || !HOOK[nome]) return;
  const input: Input = JSON.parse(readFileSync(0, "utf8"));
  debug("input", nome, input);
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  if (progettoEscluso(cwd)) return;
  const gen = leggiGenerale();
  const area = areaDi(gen.aree, cwd);
  if (!area) {
    if (nome === "session_start" && !gen.aree.length) avvisaSenzaAree();
    return; // fuori da ogni area non parte nulla
  }
  if (!gen.abilitato || typeof input.session_id !== "string" || !/^[\w-]+$/.test(input.session_id)) return;
  pulisciSessioni();
  await HOOK[nome]({ sid: input.session_id, cwd, cfg: configDi(gen, area) }, input);
}

// ---- comandi

export function normalizzaUrl(grezzo: string): string {
  let u: URL;
  try {
    u = new URL(grezzo);
  } catch {
    return errore(`URL non valido: ${grezzo}`);
  }
  const locale = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && locale)) errore("serve un URL https (http solo per localhost)");
  return u.origin + u.pathname.replace(/\/+$/, "");
}

// Una chiamata ai comandi (non agli hook): errori di rete e HTTP diventano messaggi per l'utente.
async function chiamaApi(cfg: { url: string; token: string }, metodo: string, percorso: string, corpo?: unknown): Promise<any> {
  let r: Response;
  try {
    r = await fetch(`${cfg.url}${percorso}`, {
      method: metodo,
      headers: { authorization: `Bearer ${cfg.token}`, ...(corpo === undefined ? {} : { "content-type": "application/json" }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_COMANDO),
    });
  } catch (e) {
    throw new Errore(`server non raggiungibile: ${cfg.url}`, { cause: e });
  }
  if (r.status === 401) errore("token non valido: il server risponde 401");
  const risposta = await r.json().catch(() => null);
  if (!r.ok) errore(`il server risponde ${r.status}${risposta?.errore ? `: ${risposta.errore}` : ""}`);
  return risposta;
}

async function salute(url: string, token: string): Promise<{ cliente: string }> {
  const s = await chiamaApi({ url, token }, "GET", "/api/v1/salute");
  if (s?.versione_contratto !== VERSIONE_CONTRATTO) {
    errore(`il server usa la versione ${s?.versione_contratto} del contratto, serve la ${VERSIONE_CONTRATTO}`);
  }
  return s;
}

function chiediNascosto(domanda: string): Promise<string> {
  return new Promise((fatto) => {
    const stdin = process.stdin;
    process.stderr.write(domanda);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    let testo = "";
    const leggi = (s: string) => {
      for (const ch of s) {
        if (ch === "\u0003") process.exit(130);
        if (ch !== "\r" && ch !== "\n") {
          testo = ch === "\u007f" ? testo.slice(0, -1) : testo + ch;
          continue;
        }
        stdin.setRawMode(false);
        stdin.off("data", leggi);
        stdin.pause();
        process.stderr.write("\n");
        return fatto(testo.trim());
      }
    };
    stdin.on("data", leggi).resume();
  });
}

// Registra il server MCP per la sola cartella dell'area (scope local: in un repo git vale anche nelle
// sottocartelle). Il token passa solo da qui, mai da un comando scritto da Claude.
function registraMcp(cfg: Config): string | null {
  const nome = cfg.nome_server_mcp;
  const opz = { cwd: cfg.cartella, stdio: "ignore" as const };
  try {
    execFileSync("claude", ["mcp", "remove", nome, "--scope", "local"], opz);
  } catch (e) {
    if (assente(e)) {
      console.log(`Comando claude non trovato. Aggiungi a mano in ~/.claude.json, dentro "projects" → "${cfg.cartella}", con il tuo token:\n${JSON.stringify(
        { mcpServers: { [nome]: { type: "http", url: `${cfg.url}/mcp`, headers: { Authorization: "Bearer <token>" } } } }, null, 2)}`);
      return null;
    }
    // altrimenti non era registrato: niente da togliere
  }
  try {
    execFileSync("claude", ["mcp", "add", "--transport", "http", "--scope", "local", nome, `${cfg.url}/mcp`,
      "--header", `Authorization: Bearer ${cfg.token}`], opz);
  } catch (e) {
    throw new Errore(`claude mcp add non è riuscito (codice ${(e as { status?: number }).status})`, { cause: e });
  }
  return adesso();
}

// Collega la cartella (la radice git, o la cwd senza git) a un progetto del committente del token.
async function collega(args: string[]) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { url: { type: "string" }, "token-stdin": { type: "boolean" }, crea: { type: "boolean" } },
  });
  const nome = positionals.join(" ").trim() || errore("manca il nome del progetto: forgia collega <progetto> --url <url>");
  const gen = leggiGenerale();
  const qui = areaDi(gen.aree, process.cwd());
  const url = normalizzaUrl(values.url ?? process.env.FORGIA_URL ?? qui?.url ?? errore("manca l'URL del server: /cantiere collega <progetto> <url>"));
  // Una sottocartella di un'area già collegata riusa il suo token, se il server è lo stesso.
  const token = values["token-stdin"] ? readFileSync(0, "utf8").trim()
    : process.env.FORGIA_TOKEN || (qui?.url === url ? qui.token : "") || (process.stdin.isTTY ? await chiediNascosto("Token: ")
      : errore(`manca il token: imposta FORGIA_TOKEN e rilancia, oppure da un terminale: ${SCRIPT} collega ${nome} --url ${url}`));
  if (!token) errore("token vuoto");
  const { cliente: committente } = await salute(url, token);
  const { progetti } = await chiamaApi({ url, token }, "GET", "/api/v1/progetti") as { progetti: { nome: string; slug: string }[] };
  let progetto = progetti.find((p) => p.slug === slug(nome))?.nome;
  if (!progetto) {
    if (!values.crea) {
      errore(`il progetto "${nome}" non esiste in ${committente}. Progetti: ${progetti.map((p) => p.nome).join(", ") || "nessuno"}. ` +
        `Per crearlo: forgia collega ${nome} --crea`);
    }
    progetto = (await chiamaApi({ url, token }, "POST", "/api/v1/progetti", { nome })).progetto.nome as string;
  }
  const area: Area = { cartella: reale(radiceGit(process.cwd()) ?? process.cwd()), url, token, committente, progetto, mcp_registrato_il: null };
  salvaArea(gen, area);
  area.mcp_registrato_il = registraMcp(configDi(gen, area));
  salvaArea(gen, area);
  console.log([
    `${NOME_VISIBILE}: ${area.cartella} collegata a ${committente}/${progetto} (${url}). Il tracciamento è attivo in questa cartella.`,
    area.mcp_registrato_il
      ? `Server MCP "${gen.nome_server_mcp}" registrato per questa cartella: i suoi tool arrivano dal prossimo avvio di Claude Code.`
      : "Server MCP non registrato: il resoconto forzato resta spento finché non lo registri.",
    `Per usare i tool senza conferme: /cantiere permessi (aggiunge mcp__${gen.nome_server_mcp} ai permessi).`,
  ].join("\n"));
}

const maschera = (token: string) => `…${token.slice(-4)}`;

async function status(args: string[]) {
  const { values } = parseArgs({ args, options: { json: { type: "boolean" } } });
  const gen = leggiGenerale();
  const area = areaDi(gen.aree, process.cwd());
  const server = area && await salute(area.url, area.token).then(
    (s) => ({ raggiungibile: true as const, cliente: s.cliente }),
    (e: Error) => ({ raggiungibile: false as const, errore: e.message }));
  const descrivi = (a: Area) => ({ cartella: a.cartella, committente: a.committente, progetto: a.progetto, url: a.url, token: maschera(a.token) });
  const info = {
    in_area: !!area, abilitato: gen.abilitato, nome_server_mcp: gen.nome_server_mcp, modalita_resoconto: gen.modalita_resoconto,
    area: area && { ...descrivi(area), mcp_registrato_il: area.mcp_registrato_il }, server,
    aree: gen.aree.map(descrivi), ultima_sessione: ultimaSessione(process.cwd()),
  };
  if (values.json) return console.log(JSON.stringify(info, null, 2));
  const elenco = gen.aree.length
    ? `aree collegate: ${gen.aree.map((a) => `${a.cartella} (${a.committente}/${a.progetto})`).join(", ")}`
    : "nessuna area collegata";
  if (!area) return console.log(`${NON_COLLEGATA}\n${elenco}`);
  const u = info.ultima_sessione;
  console.log([
    `${NOME_VISIBILE}: tracciamento ${gen.abilitato ? "acceso" : "spento"}`,
    `area: ${area.cartella} → ${area.committente}/${area.progetto}`,
    `server: ${area.url} (${server?.raggiungibile ? `raggiungibile, cliente ${server.cliente}` : `non raggiungibile: ${server?.errore}`})`,
    `token: ${maschera(area.token)}`,
    `server MCP: ${gen.nome_server_mcp}${area.mcp_registrato_il ? `, registrato il ${area.mcp_registrato_il}` : ", non registrato: rilancia /cantiere collega"}`,
    u ? `ultima sessione qui: ${u.session_id}, ${u.cantiere ? `cantiere ${u.cantiere}` : "lavoro diretto"} (${u.visto_il})` : "nessuna sessione vista in questa cartella",
    elenco,
  ].join("\n"));
}

function imposta(abilitato: boolean) {
  const f = leggiJson<Record<string, unknown>>(fileConfig()) ?? errore(`${NOME_VISIBILE} non configurato: lancia /cantiere collega <progetto> <url>`);
  scriviJson(fileConfig(), { ...f, abilitato }, 0o600);
  console.log(`Tracciamento ${abilitato ? "acceso" : "spento"}.`);
}

// Con un session_id (opzione o ambiente di Claude Code) l'operazione parte subito; senza, resta in
// attesa e la manda il primo hook della stessa cartella.
async function operazione(sid: string | undefined, tipo: string, dati: Record<string, unknown>) {
  const cfg = areaCorrente();
  const cwd = process.cwd();
  sid ??= process.env.CLAUDE_CODE_SESSION_ID;
  if (!sid) {
    scriviJson(fileAttesa(cwd), { tipo, dati, creato_il: adesso() } satisfies Attesa);
    return console.log("In attesa: la manda il primo hook di questa cartella, entro 10 minuti.");
  }
  const c = { sid, cwd, cfg };
  await preliminari(c);
  const r = await invia(c, evento(c, tipo, dati), true);
  if (!r) return console.log("Server non raggiungibile: l'operazione resta in coda e parte al prossimo invio.");
  if (r.codice >= 400) errore(`il server ha rifiutato l'operazione (${r.codice}): ${motivoRifiuto(r) ?? JSON.stringify(r.corpo)}`);
  const cant = r.risposta?.cantiere;
  console.log(cant ? `Cantiere "${nomeCantiere(cant)}" (change ${cant.change}).` : "Lavoro diretto sul progetto.");
}

async function apri(args: string[]) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { descrizione: { type: "string" }, padre: { type: "string" }, "session-id": { type: "string" } },
  });
  const nome = positionals.join(" ").trim() || errore("manca il nome del cantiere");
  await operazione(values["session-id"], "apri_cantiere",
    { nome, descrizione: values.descrizione ?? null, origine: "utente", padre: values.padre ?? null });
}

// Prende in lavorazione un cantiere (di solito un'idea): il server lo porta ad aperto e manda i file
// dell'idea, che finiscono in openspec/changes/<change>/idee/ senza sovrascrivere nulla (D9).
async function prendi(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { "session-id": { type: "string" } } });
  const percorso = positionals.join(" ").trim() || errore("manca il percorso del cantiere: forgia prendi <percorso>");
  const cfg = areaCorrente();
  try {
    execFileSync("openspec", ["--version"], { stdio: "ignore" });
  } catch (e) {
    errore(assente(e) ? "serve OpenSpec: installalo (npm install -g @fission-ai/openspec) e rilancia" : "openspec --version non risponde");
  }
  if (!existsSync(join(cfg.cartella, "openspec"))) errore(`in ${cfg.cartella} manca openspec/: lancia prima openspec init`);
  const cwd = process.cwd();
  const sid = values["session-id"] ?? process.env.CLAUDE_CODE_SESSION_ID ?? ultimaSessione(cwd)?.session_id
    ?? errore("nessuna sessione di Claude Code vista in questa cartella: lancia /cantiere prendi da Claude Code");
  const segmenti = percorso.split("/").map((s) => s.trim()).filter(Boolean).map(encodeURIComponent).join("/");
  const r = await chiamaApi(cfg, "POST", `/api/v1/progetti/${encodeURIComponent(cfg.progetto)}/cantieri/${segmenti}/prendi`,
    { session_id: sid, host: hostname(), cwd, ...leggiGit(cwd) }) as { cantiere: Cantiere; change: string; file: { nome: string; contenuto: string }[] };
  if (!RE_CHANGE.test(r.change)) errore(`nome di change non valido dal server: ${r.change}`);
  aggiornaSessione(sid, (s) => (s.cantiere = r.cantiere));
  const dirChange = join(cfg.cartella, "openspec", "changes", r.change);
  if (!existsSync(dirChange)) {
    try {
      execFileSync("openspec", ["new", "change", r.change], { cwd: cfg.cartella, stdio: "ignore" });
    } catch {
      errore(`il cantiere "${r.cantiere.percorso}" è preso, ma openspec new change ${r.change} non è riuscito: rilancia forgia prendi ${percorso}`);
    }
  }
  const idee = join(dirChange, "idee");
  mkdirSync(idee, { recursive: true });
  const scritti: string[] = [];
  const presenti: string[] = [];
  for (const f of r.file) {
    if (basename(f.nome) !== f.nome || f.nome.startsWith(".")) continue; // si scrive solo dentro idee/
    try {
      writeFileSync(join(idee, f.nome), f.contenuto, { flag: "wx" });
      scritti.push(f.nome);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      presenti.push(f.nome);
    }
  }
  console.log([
    `Cantiere "${r.cantiere.percorso}" preso: change ${r.change} in openspec/changes/${r.change}/.`,
    `${scritti.length} file scritti in idee/${presenti.length ? `; già presenti, lasciati com'erano: ${presenti.join(", ")}` : ""}.`,
  ].join("\n"));
}

function permettiMcp() {
  const regola = `mcp__${leggiGenerale().nome_server_mcp}`;
  const p = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
  let s: Input;
  try {
    s = leggiJson(p) ?? {};
  } catch (e) {
    throw new Errore(`${p} non è JSON valido: non lo tocco`, { cause: e });
  }
  const allow: string[] = ((s.permissions ??= {}).allow ??= []);
  if (allow.includes(regola)) return console.log(`${regola} è già tra i permessi consentiti.`);
  allow.push(regola);
  const backup = `${p}.bak-${adesso().replace(/[:.]/g, "-")}`;
  if (existsSync(p)) copyFileSync(p, backup);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  console.log(`Aggiunto ${regola} ai permessi consentiti di ${p}${existsSync(backup) ? ` (backup: ${backup})` : ""}.`);
}

const COMANDI: Record<string, (args: string[]) => unknown> = {
  collega, prendi, status, apri, on: () => imposta(true), off: () => imposta(false), "permetti-mcp": permettiMcp,
};

export async function principale(argv: string[]) {
  const [comando = "", ...args] = argv;
  if (comando === "hook") {
    try {
      await hook(args[0]);
    } catch (e) {
      debug("errore", String(e)); // fail-open: un hook non rompe mai la sessione
    }
    return;
  }
  if (!COMANDI[comando]) {
    console.error(`uso: forgia <${Object.keys(COMANDI).join("|")}> ...`);
    process.exitCode = 2;
    return;
  }
  try {
    await COMANDI[comando](args);
  } catch (e) {
    const uso = String((e as NodeJS.ErrnoException).code).startsWith("ERR_PARSE_ARGS");
    if (!(e instanceof Errore) && !uso) throw e;
    console.error((e as Error).message);
    process.exitCode = uso ? 2 : 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await principale(process.argv.slice(2));
