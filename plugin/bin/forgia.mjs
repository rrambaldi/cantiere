// cantiere forgia: hook di Claude Code e comandi `forgia ...`. Solo moduli interni di Node.
// Il contratto con il server è in docs/contratto-v1.md. Si spedisce compilato in forgia.mjs
// (npx tsc -p plugin/tsconfig.build.json): il type stripping a ogni hook costava ~280 ms.
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, closeSync, copyFileSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
export const NOME = "forgia";
export const NOME_VISIBILE = "cantiere forgia";
const VERSIONE_CONTRATTO = 1;
const TIMEOUT_HTTP = 1500;
const TIMEOUT_GIT = 1000;
const MAX_CODA = 500;
const SCADENZA_ATTESA = 10 * 60_000;
const VITA_SESSIONE = 7 * 24 * 3600_000;
const SORGENTI = ["startup", "resume", "clear", "compact"];
const ESITI = ["completato", "sospeso", "abbandonato"];
const STATI_TODO = ["pending", "in_progress", "completed", "deleted"];
const RIFIUTI_DEFINITIVI = [409, 413, 422];
const OSCURATI = new Set(["prompt", "last_assistant_message", "token"]);
export const RE_CANTIERE = /^\/(\S+:)?cantiere(\s|$)/;
// Prime parole di /cantiere che gestisce il comando, non l'hook.
const RISERVATE = ["stato", "server", "permessi", "on", "off"];
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), NOME);
class Errore extends Error {
}
const errore = (msg) => { throw new Errore(msg); };
const assente = (e) => e.code === "ENOENT";
const adesso = () => new Date().toISOString();
// ---- percorsi, file e config
const radice = (xdg, win, def) => join(process.env[xdg] || (process.platform === "win32" && win) || join(homedir(), def), NOME);
const fileConfig = () => join(radice("XDG_CONFIG_HOME", process.env.APPDATA, ".config"), "config.json");
const cache = (...p) => join(radice("XDG_CACHE_HOME", process.env.LOCALAPPDATA, ".cache"), ...p);
function leggiJson(p) {
    try {
        return JSON.parse(readFileSync(p, "utf8"));
    }
    catch (e) {
        if (assente(e))
            return null;
        throw e;
    }
}
function scriviJson(p, v, mode) {
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(v, null, 2), { mode });
    renameSync(tmp, p);
}
export function leggiConfig() {
    const f = leggiJson(fileConfig()) ?? {};
    const url = process.env.FORGIA_URL || f.url;
    const token = process.env.FORGIA_TOKEN || f.token;
    if (!url || !token)
        return null;
    return { abilitato: true, nome_server_mcp: NOME, modalita_resoconto: null, mcp_registrato_il: null, ...f, url, token };
}
function debug(...voci) {
    if (process.env.FORGIA_DEBUG !== "1")
        return;
    mkdirSync(cache(), { recursive: true });
    const riga = JSON.stringify({ ts: adesso(), voci }, (k, v) => (OSCURATI.has(k) ? "<oscurato>" : v));
    appendFileSync(cache("debug.log"), riga + "\n");
}
// ---- git e repo
function git(cwd, ...args) {
    try {
        const out = execFileSync("git", ["-C", cwd, ...args], {
            timeout: TIMEOUT_GIT, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8",
        });
        return out.trim() || null;
    }
    catch {
        return null; // niente git, niente repo o niente remote: il contratto vuole null
    }
}
export function normalizzaRepo(url) {
    const s = url.trim().replace(/\/+$/, "").replace(/\.git$/, "");
    const scp = /^[^@/]+@([^:/]+):(.+)$/.exec(s);
    if (scp && !s.includes("://"))
        return `${scp[1].toLowerCase()}/${scp[2]}`;
    try {
        const u = new URL(s);
        return u.hostname ? u.hostname + u.pathname.replace(/\/+$/, "") : null;
    }
    catch {
        return null; // percorso locale o URL che non è un remote di rete
    }
}
// Senza lanciare git: è nel percorso caldo dell'hook sincrono del prompt.
function radiceGit(cwd) {
    for (let d = resolve(cwd);; d = dirname(d)) {
        if (existsSync(join(d, ".git")))
            return d;
        if (dirname(d) === d)
            return null;
    }
}
// Lanciato solo quando parte un evento.
function leggiGit(cwd) {
    if (!radiceGit(cwd))
        return { repo: null, branch: null };
    const remoto = git(cwd, "config", "--get", "remote.origin.url");
    return { branch: git(cwd, "branch", "--show-current"), repo: remoto && normalizzaRepo(remoto) };
}
const progettoEscluso = (cwd) => [cwd, radiceGit(cwd)].some((d) => d && existsSync(join(d, ".forgia-off")));
// ---- sessioni in cache
const fileSessione = (sid) => cache("sessioni", `${sid}.json`);
const leggiSessione = (sid) => leggiJson(fileSessione(sid));
function aggiornaSessione(sid, cambia) {
    const s = leggiSessione(sid);
    if (!s)
        return;
    cambia(s);
    scriviJson(fileSessione(sid), s);
}
function pulisciSessioni() {
    const dir = cache("sessioni");
    if (!existsSync(dir))
        return;
    for (const f of readdirSync(dir)) {
        const modificato = statSync(join(dir, f), { throwIfNoEntry: false })?.mtimeMs; // un altro hook può averlo appena tolto
        if (modificato && Date.now() - modificato > VITA_SESSIONE)
            rmSync(join(dir, f), { force: true });
    }
}
// Il percorso (padre/figlio) se il server lo manda, altrimenti il nome.
const nomeCantiere = (c) => (c ? c.percorso ?? c.nome : null);
export function ultimaSessione(cwd) {
    const dir = cache("sessioni");
    if (!existsSync(dir))
        return null;
    const qui = readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ id: f.slice(0, -5), s: leggiJson(join(dir, f)) }))
        .filter((x) => x.s?.cwd === resolve(cwd))
        .map(({ id, s }) => ({ session_id: id, cantiere: nomeCantiere(s.cantiere), visto_il: s.ultimo_evento_il ?? s.primo_visto }))
        .sort((a, b) => b.visto_il.localeCompare(a.visto_il));
    return qui[0] ?? null;
}
// ---- eventi, coda e invio
function evento(c, tipo, dati) {
    c.git ??= leggiGit(c.cwd);
    return {
        evento_id: randomUUID(), ts: adesso(), tipo, session_id: c.sid, host: hostname(), cwd: c.cwd,
        repo: c.git.repo, branch: c.git.branch, dati,
    };
}
const fileInCoda = (ev) => cache("coda", `${String(Date.parse(ev.ts)).padStart(15, "0")}-${ev.evento_id}.json`);
const inCoda = () => (existsSync(cache("coda")) ? readdirSync(cache("coda")).filter((f) => f.endsWith(".json")).sort() : []);
function accoda(ev) {
    scriviJson(fileInCoda(ev), ev);
    const file = inCoda();
    for (const f of file.slice(0, Math.max(0, file.length - MAX_CODA)))
        rmSync(cache("coda", f), { force: true });
}
async function posta(cfg, ev) {
    try {
        const r = await fetch(`${cfg.url}/api/v1/eventi`, {
            method: "POST",
            headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
            body: JSON.stringify(ev),
            signal: AbortSignal.timeout(TIMEOUT_HTTP),
        });
        const corpo = await r.json().catch(() => null);
        return { codice: r.status, risposta: r.ok ? corpo : null, corpo };
    }
    catch {
        return null; // rete giù o timeout: l'evento resta in coda
    }
}
// Manda un evento già in coda. Lo toglie se il server l'ha accettato o rifiutato per sempre;
// null vuol dire che resta in coda.
async function consegna(cfg, ev, inietta) {
    const r = await posta(cfg, ev);
    debug("risposta", ev.tipo, r);
    if (!r || !(r.codice < 300 || RIFIUTI_DEFINITIVI.includes(r.codice)))
        return null;
    rmSync(fileInCoda(ev), { force: true });
    if (r.risposta)
        registraRisposta(ev, r.risposta, inietta);
    return r;
}
function registraRisposta(ev, r, inietta) {
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
// tetto di tempo: un hook sincrono non resta appeso a svuotare una coda lunga.
async function invia(c, ev, inietta = false) {
    accoda(ev);
    const r = await consegna(c.cfg, ev, inietta);
    if (!r)
        return null;
    const fine = Date.now() + TIMEOUT_HTTP;
    for (const f of inCoda()) {
        const vecchio = leggiJson(cache("coda", f));
        if (Date.now() > fine || (vecchio && !(await consegna(c.cfg, vecchio, false))))
            break;
    }
    return r;
}
const fileAttesa = (cwd) => cache("attesa", `${createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 16)}.json`);
function prendiAttesa(cwd) {
    const p = fileAttesa(cwd);
    const mia = `${p}.${process.pid}`;
    try {
        renameSync(p, mia); // la prende un hook solo
    }
    catch (e) {
        if (assente(e))
            return null;
        throw e;
    }
    const op = leggiJson(mia);
    rmSync(mia, { force: true });
    return op && Date.now() - Date.parse(op.creato_il) < SCADENZA_ATTESA ? op : null;
}
// Sessione mai vista: prima un session_start tardivo. Poi l'eventuale operazione in attesa.
async function preliminari(c) {
    if (!leggiSessione(c.sid)) {
        scriviJson(fileSessione(c.sid), { primo_visto: adesso(), cwd: resolve(c.cwd) });
        await invia(c, evento(c, "session_start", { source: "tardivo" }));
    }
    const op = prendiAttesa(c.cwd);
    if (op)
        await invia(c, evento(c, op.tipo, op.dati));
}
const FORZA = ["-f", "--force"];
export function riconosci(prompt) {
    const testo = prompt.trimStart();
    const m = RE_CANTIERE.exec(testo);
    if (!m)
        return null;
    const args = testo.slice(m[0].length).trim();
    const [primo = "", ...resto] = args.split(/\s+/);
    if (!primo || RISERVATE.includes(primo))
        return { op: null };
    if (primo === "chiudi") {
        const [esito = "completato", ...nota] = resto.filter((p) => !FORZA.includes(p));
        if (!ESITI.includes(esito))
            return { op: null };
        return { op: "chiudi", esito: esito, nota: nota.join(" ") || null, forza: resto.some((p) => FORZA.includes(p)) };
    }
    const d = /^(.+?)\s+(?:—|--)\s+(.+)$/s.exec(args);
    // Il nome può essere un percorso padre/figlio: lo risolve il server.
    const p = /(?:^|\s)--padre\s+(\S+)/.exec(d ? d[1] : args);
    const nome = (d ? d[1] : args).replace(p?.[0] ?? "", "").trim();
    return nome ? { op: "apri", nome, padre: p?.[1] ?? null, descrizione: d ? d[2] : null } : { op: null };
}
const eventoComando = (cmd) => cmd.op === "apri"
    ? { tipo: "apri_cantiere", dati: { nome: cmd.nome, descrizione: cmd.descrizione, origine: "utente", padre: cmd.padre } }
    : { tipo: "chiudi_cantiere", dati: { esito: cmd.esito, nota: cmd.nota, forza: cmd.forza } };
// Il motivo di un 409 (padre con figli aperti, padre diverso, precedenza), dal corpo del server.
const motivoRifiuto = (r) => r.corpo?.errore;
export function datiTodo(strumento, inp, ris, noti) {
    const valida = (v) => typeof v.testo === "string" && STATI_TODO.includes(v.stato);
    if (strumento === "TodoWrite") {
        const todos = Array.isArray(inp?.todos) ? inp.todos.map((t) => ({ id: null, testo: t?.content, stato: t?.status })) : null;
        return todos?.every(valida) ? { dati: { strumento, completo: true, todos }, noti } : null;
    }
    const id = strumento === "TaskCreate" ? ris?.task?.id : strumento === "TaskUpdate" ? inp?.taskId : undefined;
    if (typeof id !== "string" && typeof id !== "number")
        return null;
    const prima = noti[id] ?? { testo: "", stato: "pending" };
    const voce = { testo: inp?.subject ?? prima.testo, stato: inp?.status ?? prima.stato };
    if (!valida(voce))
        return null;
    return { dati: { strumento, completo: false, todos: [{ id: String(id), ...voce }] }, noti: { ...noti, [id]: voce } };
}
const esclusoDalConteggio = (nome, server) => nome === "TodoWrite" || nome.startsWith("Task") || nome.startsWith(`mcp__${server}__`);
// Conta i tool del turno dalla fine del transcript fino all'ultimo messaggio vero dell'utente.
function contaRighe(righe, server) {
    const conteggio = { strumenti: 0, resoconto: false };
    for (let i = righe.length - 1; i >= 0; i--) {
        if (!righe[i].trim())
            continue;
        const r = JSON.parse(righe[i]);
        const c = r.message?.content;
        if (r.isSidechain)
            continue;
        if (r.type === "user" && !r.isMeta) {
            if (typeof c === "string")
                return { trovato: true, conteggio };
            if (!Array.isArray(c))
                throw new Error("messaggio utente di forma inattesa");
            if (!c.every((b) => b?.type === "tool_result"))
                return { trovato: true, conteggio };
        }
        else if (r.type === "assistant") {
            if (!Array.isArray(c))
                throw new Error("messaggio assistant di forma inattesa");
            for (const b of c) {
                if (b?.type !== "tool_use")
                    continue;
                if (typeof b.name !== "string")
                    throw new Error("tool_use senza nome");
                if (b.name === `mcp__${server}__aggiorna_stato`)
                    conteggio.resoconto = true;
                if (!esclusoDalConteggio(b.name, server))
                    conteggio.strumenti++;
            }
        }
    }
    return { trovato: false, conteggio };
}
// Legge il transcript dalla fine, con una finestra che cresce finché trova l'inizio del turno.
export function contaTurno(percorso, server) {
    try {
        const fd = openSync(percorso, "r");
        try {
            const dim = fstatSync(fd).size;
            for (let finestra = 1 << 18;; finestra *= 4) {
                const da = Math.max(0, dim - finestra);
                const buf = Buffer.alloc(dim - da);
                readSync(fd, buf, 0, buf.length, da);
                const righe = buf.toString("utf8").split("\n");
                const r = contaRighe(da > 0 ? righe.slice(1) : righe, server);
                if (r.trovato || da === 0)
                    return r.conteggio;
            }
        }
        finally {
            closeSync(fd);
        }
    }
    catch {
        return null; // transcript assente, troncato o di forma inattesa: conteggio non affidabile
    }
}
export function decidiBlocco(p) {
    return !p.attivo && !!p.conteggio && p.modalita === "forzato" && p.conteggio.strumenti >= p.soglia &&
        !p.conteggio.resoconto && !!p.avvio && !!p.registrato && p.avvio > p.registrato;
}
const contestoHook = (hookEventName, additionalContext) => console.log(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } }));
function avvisaNonConfigurato() {
    const oggi = adesso().slice(0, 10);
    if (leggiJson(cache("avviso.json")) === oggi)
        return;
    scriviJson(cache("avviso.json"), oggi);
    console.log(JSON.stringify({ systemMessage: `${NOME_VISIBILE} non configurato: lancia /cantiere` }));
}
const HOOK = {
    async session_start(c, input) {
        const source = SORGENTI.includes(input.source) ? input.source : "resume";
        const s = leggiSessione(c.sid) ?? { primo_visto: adesso(), cwd: resolve(c.cwd) };
        if (source === "startup" || source === "resume")
            s.avvio_reale_il = adesso();
        scriviJson(fileSessione(c.sid), s);
        const r = await invia(c, evento(c, "session_start", { source }), true);
        await preliminari(c);
        const contesto = r ? r.risposta?.contesto : `[${NOME}] session_id=${c.sid} (server non raggiungibile)`;
        if (contesto)
            contestoHook("SessionStart", contesto);
    },
    // Sincrono: gestisce /cantiere, altrimenti inietta il contesto pendente senza rete.
    async prompt(c, input) {
        const cmd = typeof input.prompt === "string" ? riconosci(input.prompt) : null;
        if (cmd) {
            if (!cmd.op)
                return;
            await preliminari(c);
            const { tipo, dati } = eventoComando(cmd);
            const r = await invia(c, evento(c, tipo, dati), true);
            const motivo = r?.codice === 409 && motivoRifiuto(r);
            const contesto = typeof motivo === "string"
                ? `[${NOME}] Comando /cantiere gestito: ${motivo} Rispondi all'utente con una sola riga.`
                : r?.risposta?.contesto;
            if (contesto)
                contestoHook("UserPromptSubmit", contesto);
            return;
        }
        const pendente = leggiSessione(c.sid)?.contesto_pendente;
        if (!pendente)
            return;
        aggiornaSessione(c.sid, (s) => delete s.contesto_pendente);
        contestoHook("UserPromptSubmit", pendente);
    },
    async prompt_invio(c, input) {
        if (typeof input.prompt === "string" && riconosci(input.prompt))
            return;
        await preliminari(c);
        await invia(c, evento(c, "prompt", {}));
    },
    async todo(c, input) {
        await preliminari(c);
        const t = datiTodo(input.tool_name, input.tool_input, input.tool_response, leggiSessione(c.sid)?.todo ?? {});
        if (!t)
            return;
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
        await invia(c, evento(c, "session_end", { reason: String(input.reason ?? "other") }));
    },
};
async function hook(nome) {
    if (process.env.FORGIA_DISABLED === "1" || !HOOK[nome])
        return;
    const input = JSON.parse(readFileSync(0, "utf8"));
    debug("input", nome, input);
    const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
    if (progettoEscluso(cwd))
        return;
    const cfg = leggiConfig();
    if (!cfg) {
        if (nome === "session_start")
            avvisaNonConfigurato();
        return;
    }
    if (!cfg.abilitato || typeof input.session_id !== "string" || !/^[\w-]+$/.test(input.session_id))
        return;
    pulisciSessioni();
    await HOOK[nome]({ sid: input.session_id, cwd, cfg }, input);
}
// ---- comandi
export function normalizzaUrl(grezzo) {
    let u;
    try {
        u = new URL(grezzo);
    }
    catch {
        return errore(`URL non valido: ${grezzo}`);
    }
    const locale = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && locale))
        errore("serve un URL https (http solo per localhost)");
    return u.origin + u.pathname.replace(/\/+$/, "");
}
async function salute(url, token) {
    let r;
    try {
        r = await fetch(`${url}/api/v1/salute`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    }
    catch (e) {
        throw new Errore(`server non raggiungibile: ${url}`, { cause: e });
    }
    if (r.status === 401)
        errore("token non valido: il server risponde 401");
    if (!r.ok)
        errore(`il server risponde ${r.status}`);
    const s = await r.json();
    if (s?.versione_contratto !== VERSIONE_CONTRATTO) {
        errore(`il server usa la versione ${s?.versione_contratto} del contratto, serve la ${VERSIONE_CONTRATTO}`);
    }
    return s;
}
function chiediNascosto(domanda) {
    return new Promise((fatto) => {
        const stdin = process.stdin;
        process.stderr.write(domanda);
        stdin.setRawMode(true);
        stdin.setEncoding("utf8");
        let testo = "";
        const leggi = (s) => {
            for (const ch of s) {
                if (ch === "\u0003")
                    process.exit(130);
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
// Registra il server MCP a livello utente. Il token passa solo da qui, mai da un comando scritto da Claude.
function registraMcp(cfg) {
    const nome = cfg.nome_server_mcp;
    try {
        execFileSync("claude", ["mcp", "remove", nome, "--scope", "user"], { stdio: "ignore" });
    }
    catch (e) {
        if (assente(e)) {
            console.log(`Comando claude non trovato. Aggiungi a mano in ~/.claude.json, con il tuo token:\n${JSON.stringify({ mcpServers: { [nome]: { type: "http", url: `${cfg.url}/mcp`, headers: { Authorization: "Bearer <token>" } } } }, null, 2)}`);
            return null;
        }
        // altrimenti non era registrato: niente da togliere
    }
    try {
        execFileSync("claude", ["mcp", "add", "--transport", "http", "--scope", "user", nome, `${cfg.url}/mcp`,
            "--header", `Authorization: Bearer ${cfg.token}`], { stdio: "ignore" });
    }
    catch (e) {
        throw new Errore(`claude mcp add non è riuscito (codice ${e.status})`, { cause: e });
    }
    return adesso();
}
async function setup(args) {
    const { values } = parseArgs({ args, options: { url: { type: "string" }, "token-stdin": { type: "boolean" } } });
    const url = normalizzaUrl(values.url ?? errore("manca --url"));
    const token = values["token-stdin"] ? readFileSync(0, "utf8").trim()
        : process.env.FORGIA_TOKEN || (process.stdin.isTTY ? await chiediNascosto("Token: ")
            : errore(`manca il token: imposta FORGIA_TOKEN e rilancia, oppure da un terminale: ${SCRIPT} setup --url ${url}`));
    if (!token)
        errore("token vuoto");
    const { cliente } = await salute(url, token);
    const prima = leggiJson(fileConfig()) ?? {};
    const cfg = { nome_server_mcp: NOME, modalita_resoconto: null, ...prima, url, token, abilitato: true, mcp_registrato_il: null };
    scriviJson(fileConfig(), cfg, 0o600);
    cfg.mcp_registrato_il = registraMcp(cfg);
    scriviJson(fileConfig(), cfg, 0o600);
    console.log([
        `${NOME_VISIBILE} configurato: ${url} (cliente ${cliente}). Il tracciamento è attivo.`,
        cfg.mcp_registrato_il
            ? `Server MCP "${cfg.nome_server_mcp}" registrato: i suoi tool arrivano dal prossimo avvio di Claude Code.`
            : "Server MCP non registrato: il resoconto forzato resta spento finché non lo registri.",
        `Per usare i tool senza conferme: /cantiere permessi (aggiunge mcp__${cfg.nome_server_mcp} ai permessi).`,
    ].join("\n"));
}
async function status(args) {
    const { values } = parseArgs({ args, options: { json: { type: "boolean" } } });
    const cfg = leggiConfig();
    const server = cfg && await salute(cfg.url, cfg.token).then((s) => ({ raggiungibile: true, cliente: s.cliente }), (e) => ({ raggiungibile: false, errore: e.message }));
    const info = {
        configurato: !!cfg, abilitato: cfg?.abilitato ?? false, url: cfg?.url ?? null,
        token: cfg ? `…${cfg.token.slice(-4)}` : null, token_da_ambiente: !!process.env.FORGIA_TOKEN,
        nome_server_mcp: cfg?.nome_server_mcp ?? NOME, modalita_resoconto: cfg?.modalita_resoconto ?? null,
        mcp_registrato_il: cfg?.mcp_registrato_il ?? null, server, ultima_sessione: ultimaSessione(process.cwd()),
    };
    if (values.json)
        return console.log(JSON.stringify(info, null, 2));
    if (!cfg)
        return console.log(`${NOME_VISIBILE} non configurato: lancia /cantiere server <url> [nome]`);
    const u = info.ultima_sessione;
    console.log([
        `${NOME_VISIBILE}: tracciamento ${cfg.abilitato ? "acceso" : "spento"}`,
        `server: ${cfg.url} (${server?.raggiungibile ? `raggiungibile, cliente ${server.cliente}` : `non raggiungibile: ${server?.errore}`})`,
        `token: ${info.token}`,
        `server MCP: ${info.nome_server_mcp}${cfg.mcp_registrato_il ? `, registrato il ${cfg.mcp_registrato_il}` : ", non registrato: rilancia il setup con /cantiere server"}`,
        u ? `ultima sessione qui: ${u.session_id}, cantiere ${u.cantiere ?? "nessuno"} (${u.visto_il})` : "nessuna sessione vista in questa cartella",
    ].join("\n"));
}
function imposta(abilitato) {
    const f = leggiJson(fileConfig()) ?? errore(`${NOME_VISIBILE} non configurato: lancia /cantiere`);
    scriviJson(fileConfig(), { ...f, abilitato }, 0o600);
    console.log(`Tracciamento ${abilitato ? "acceso" : "spento"}.`);
}
// Con un session_id (opzione o ambiente di Claude Code) l'operazione parte subito; senza, resta in
// attesa e la manda il primo hook della stessa cartella.
async function operazione(sid, tipo, dati) {
    const cfg = leggiConfig() ?? errore(`${NOME_VISIBILE} non configurato: lancia /cantiere`);
    const cwd = process.cwd();
    sid ??= process.env.CLAUDE_CODE_SESSION_ID;
    if (!sid) {
        scriviJson(fileAttesa(cwd), { tipo, dati, creato_il: adesso() });
        return console.log("In attesa: la manda il primo hook di questa cartella, entro 10 minuti.");
    }
    const c = { sid, cwd, cfg };
    await preliminari(c);
    const r = await invia(c, evento(c, tipo, dati), true);
    if (!r)
        return console.log("Server non raggiungibile: l'operazione resta in coda e parte al prossimo invio.");
    if (r.codice >= 400)
        errore(`il server ha rifiutato l'operazione (${r.codice}): ${motivoRifiuto(r) ?? JSON.stringify(r.corpo)}`);
    const cant = r.risposta?.cantiere;
    console.log(cant ? `Cantiere "${nomeCantiere(cant)}" (id ${cant.id}).` : "Cantiere chiuso.");
}
async function apri(args) {
    const { values, positionals } = parseArgs({
        args, allowPositionals: true,
        options: { descrizione: { type: "string" }, padre: { type: "string" }, "session-id": { type: "string" } },
    });
    const nome = positionals.join(" ").trim() || errore("manca il nome del cantiere");
    await operazione(values["session-id"], "apri_cantiere", { nome, descrizione: values.descrizione ?? null, origine: "utente", padre: values.padre ?? null });
}
async function chiudi(args) {
    const { values } = parseArgs({
        args, options: {
            esito: { type: "string", default: "completato" }, nota: { type: "string" }, forza: { type: "boolean", short: "f" },
            "session-id": { type: "string" },
        },
    });
    if (!ESITI.includes(values.esito))
        errore(`esito non valido: usa ${ESITI.join(", ")}`);
    await operazione(values["session-id"], "chiudi_cantiere", { esito: values.esito, nota: values.nota ?? null, forza: !!values.forza });
}
function permettiMcp() {
    const regola = `mcp__${leggiConfig()?.nome_server_mcp ?? NOME}`;
    const p = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
    let s;
    try {
        s = leggiJson(p) ?? {};
    }
    catch (e) {
        throw new Errore(`${p} non è JSON valido: non lo tocco`, { cause: e });
    }
    const allow = ((s.permissions ??= {}).allow ??= []);
    if (allow.includes(regola))
        return console.log(`${regola} è già tra i permessi consentiti.`);
    allow.push(regola);
    const backup = `${p}.bak-${adesso().replace(/[:.]/g, "-")}`;
    if (existsSync(p))
        copyFileSync(p, backup);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
    console.log(`Aggiunto ${regola} ai permessi consentiti di ${p}${existsSync(backup) ? ` (backup: ${backup})` : ""}.`);
}
const COMANDI = {
    setup, status, apri, chiudi, on: () => imposta(true), off: () => imposta(false), "permetti-mcp": permettiMcp,
};
export async function principale(argv) {
    const [comando = "", ...args] = argv;
    if (comando === "hook") {
        try {
            await hook(args[0]);
        }
        catch (e) {
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
    }
    catch (e) {
        const uso = String(e.code).startsWith("ERR_PARSE_ARGS");
        if (!(e instanceof Errore) && !uso)
            throw e;
        console.error(e.message);
        process.exitCode = uso ? 2 : 1;
    }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
    await principale(process.argv.slice(2));
