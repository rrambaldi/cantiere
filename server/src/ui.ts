import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CorpoTroppoGrande, creaCommittente, elencaCommittenti, leggiCorpo, rigeneraToken, trovaCommittente } from "./accesso.ts";
import { di, progettiDi, sessioniDi, TUTTI, type Ambito } from "./ambito.ts";
import { AZIONI, cambiaEsito, creaProgetto, discendentiAttivi, elencaSessioni, formaProgetto, leggiCantieri, percorsoDi, ultimiStati, type Ambiente, type Azione } from "./dominio.ts";
import { domandeInAttesa } from "./domande.ts";
import { aggiungiFile, creaIdea, eliminaFile, modificaIdea } from "./idee.ts";
import { contaTask, Rifiuto } from "./modelli.ts";

/** La release (AA.MM.N) è la versione di server/package.json. */
export const RELEASE: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

export const CARTELLA_UI = fileURLToPath(new URL("../ui/", import.meta.url));

const pacchetto = (nome: string) => dirname(createRequire(import.meta.url).resolve(`${nome}/package.json`));
const VENDOR: Record<string, string> = {
  "react.production.min.js": join(pacchetto("react"), "umd", "react.production.min.js"),
  "react-dom.production.min.js": join(pacchetto("react-dom"), "umd", "react-dom.production.min.js"),
  "markdown-it.min.js": join(pacchetto("markdown-it"), "dist", "markdown-it.min.js"),
  "easymde.min.js": join(pacchetto("easymde"), "dist", "easymde.min.js"),
  "easymde.min.css": join(pacchetto("easymde"), "dist", "easymde.min.css"),
};
const TIPI: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2",
};
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
  "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const decodifica = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    throw new Rifiuto(404, "Pagina inesistente.");
  }
};

// --- Letture della dashboard ---------------------------------------------------------------------

async function albero(amb: Ambiente, ambito: Ambito) {
  const committenti = (await elencaCommittenti(amb.db)).filter((c) => ambito.committenteId === null || c.id === ambito.committenteId);
  const progetti = await progettiDi(amb.db, ambito).selectAll("progetti").orderBy("progetti.slug").execute();
  const cantieri = await leggiCantieri(amb.db, amb.config, ambito);
  const domande = await domandeInAttesa(amb.db, ambito);
  const sciolte = await sessioniDi(amb.db, ambito)
    .select(["sessioni.progetto_id", (eb) => eb.fn.countAll<number>().as("n")])
    .where("sessioni.cantiere_id", "is", null)
    .groupBy("sessioni.progetto_id")
    .execute();
  return {
    release: RELEASE,
    committenti: committenti.map((c) => ({
      ...c,
      progetti: progetti
        .filter((p) => p.committente_id === c.id)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          slug: p.slug,
          creato_il: p.creato_il,
          domande_in_attesa: domande.filter((d) => d.progetto_id === p.id).length,
          non_censite: Number(sciolte.find((s) => s.progetto_id === p.id)?.n ?? 0),
          cantieri: cantieri.filter((x) => x.progetto_id === p.id),
        })),
    })),
  };
}

async function dettaglio(amb: Ambiente, ambito: Ambito, id: number) {
  const [cantiere] = await leggiCantieri(amb.db, amb.config, ambito, { ids: [id] });
  if (!cantiere) throw new Rifiuto(404, "Cantiere inesistente.");
  const turni = await amb.db
    .selectFrom("stati")
    .leftJoin("sessioni", "sessioni.session_id", "stati.session_id")
    .select(["stati.ts", "stati.session_id", "sessioni.host", "sessioni.titolo", "stati.fatto", "stati.prossimo", "stati.bloccato_da", "stati.percentuale"])
    .where("stati.cantiere_id", "=", id)
    .orderBy("stati.id", "desc")
    .execute();
  const copia = await amb.db.selectFrom("change_copie").select("cantiere_id").where("cantiere_id", "=", id).executeTakeFirst();
  const file = copia
    ? await amb.db.selectFrom("change_file").select(["percorso", "contenuto"]).where("cantiere_id", "=", id).orderBy("percorso").execute()
    : (await amb.db.selectFrom("idee_file").select(["nome", "contenuto"]).where("cantiere_id", "=", id).orderBy("nome").execute()).map((f) => ({
        percorso: `idee/${f.nome}`,
        contenuto: f.contenuto,
      }));
  const host = new Map((cantiere.sessioni ?? []).map((s) => [s.session_id, s.host]));
  const todo = host.size
    ? (await amb.db.selectFrom("todo").select(["session_id", "testo", "stato"]).where("session_id", "in", [...host.keys()]).orderBy("session_id").orderBy("ordine").execute()).map(
        (t) => ({ ...t, host: host.get(t.session_id)! }),
      )
    : [];
  const esiti = await amb.db.selectFrom("esiti").select(["stato", "ts", "da"]).where("cantiere_id", "=", id).orderBy("id").execute();
  const discendenti = await discendentiAttivi(amb.db, id);
  const tasks = copia && file.find((f) => f.percorso === "tasks.md");
  return {
    cantiere,
    turni,
    file,
    task_aperti: tasks ? contaTask(tasks.contenuto).aperti : [],
    todo,
    esiti,
    discendenti_attivi: await Promise.all(discendenti.map((d) => percorsoDi(amb.db, d.id))),
  };
}

async function nonCensite(amb: Ambiente, ambito: Ambito, progettoId: number) {
  const p = await progettiDi(amb.db, ambito).select("progetti.id").where("progetti.id", "=", progettoId).executeTakeFirst();
  if (!p) throw new Rifiuto(404, "Progetto inesistente.");
  const sessioni = await elencaSessioni(amb.db, amb.config, ambito, { progettoId, senzaCantiere: true });
  const ultimi = await ultimiStati(amb.db, sessioni.map((s) => s.session_id));
  const domande = await domandeInAttesa(amb.db, ambito);
  return {
    sessioni: sessioni.map((s) => ({
      session_id: s.session_id,
      titolo: s.titolo,
      host: s.host,
      avviata_il: s.avviata_il,
      ultimo_evento_il: s.ultimo_evento_il,
      turni: s.turni,
      stato: s.stato,
      ultimo_stato: ultimi.get(s.session_id) ?? null,
      domande: domande.filter((d) => d.domanda.session_id === s.session_id).map((d) => d.domanda),
    })),
  };
}

/** Committente dell'URL, se l'ambito lo vede. */
function committenteVisibile(ambito: Ambito, id: number) {
  if (ambito.committenteId !== null && ambito.committenteId !== id) throw new Rifiuto(404, "Committente inesistente.");
  return id;
}

// --- Rotte ----------------------------------------------------------------------------------------

type Corpo = Record<string, unknown>;
type Rotta = (amb: Ambiente, ambito: Ambito, id: number, corpo: Corpo) => Promise<object>;

const LETTURE: [RegExp, Rotta][] = [
  [/^\/ui\/api\/albero$/, (amb, ambito) => albero(amb, ambito)],
  [/^\/ui\/api\/cantieri\/(\d+)$/, (amb, ambito, id) => dettaglio(amb, ambito, id)],
  [/^\/ui\/api\/progetti\/(\d+)\/non-censite$/, (amb, ambito, id) => nonCensite(amb, ambito, id)],
];

const SCRITTURE: [RegExp, Rotta][] = [
  [
    /^\/ui\/api\/committenti$/,
    async (amb, ambito, _id, corpo) => {
      if (ambito.committenteId !== null) throw new Rifiuto(403, "Nella vista di un committente non se ne creano altri.");
      return creaCommittente(amb.db, String(corpo.nome ?? ""));
    },
  ],
  [/^\/ui\/api\/committenti\/(\d+)\/rigenera$/, async (amb, ambito, id) => ({ token: await rigeneraToken(amb.db, { id: committenteVisibile(ambito, id) }) })],
  [
    /^\/ui\/api\/committenti\/(\d+)\/progetti$/,
    async (amb, ambito, id, corpo) => {
      committenteVisibile(ambito, id);
      if (!(await elencaCommittenti(amb.db)).some((c) => c.id === id)) throw new Rifiuto(404, "Committente inesistente.");
      return { progetto: formaProgetto(await creaProgetto(amb.db, id, String(corpo.nome ?? ""))) };
    },
  ],
  [/^\/ui\/api\/progetti\/(\d+)\/idee$/, async (amb, ambito, id, corpo) => ({ cantiere: await creaIdea(amb, ambito, id, corpo) })],
  [/^\/ui\/api\/cantieri\/(\d+)\/modifica$/, async (amb, ambito, id, corpo) => ({ cantiere: await modificaIdea(amb, ambito, id, corpo) })],
  [/^\/ui\/api\/cantieri\/(\d+)\/file$/, async (amb, ambito, id, corpo) => ({ file: await aggiungiFile(amb, ambito, id, corpo) })],
  [/^\/ui\/api\/cantieri\/(\d+)\/file\/elimina$/, async (amb, ambito, id, corpo) => (await eliminaFile(amb, ambito, id, corpo.nome), {})],
  [
    /^\/ui\/api\/cantieri\/(\d+)\/esito$/,
    async (amb, ambito, id, corpo) => {
      if (!AZIONI.includes(corpo.azione as Azione)) throw new Rifiuto(422, `azione: una tra ${AZIONI.join(", ")}.`);
      return { cantieri: await cambiaEsito(amb, ambito, id, corpo.azione as Azione) };
    },
  ],
];

/**
 * Gestore della dashboard: pagina, file statici e API JSON, tutti dietro il certificato client che
 * nginx conferma con un header (design D5). Restituisce codice ed etichetta per il log.
 */
export function creaUi(amb: Ambiente, cartella: string, hostAmmessi: string[]) {
  const header = amb.config.ui_header_certificato.toLowerCase();

  function rispondi(res: ServerResponse, codice: number, corpo: object | null = null): number {
    if (corpo === null) res.writeHead(codice).end();
    else res.writeHead(codice, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(corpo));
    return codice;
  }

  async function file(res: ServerResponse, percorso: string, sostituisci?: (testo: string) => string): Promise<number> {
    let contenuto: Buffer | string;
    try {
      contenuto = await readFile(percorso);
    } catch {
      return rispondi(res, 404);
    }
    if (sostituisci) contenuto = sostituisci(contenuto.toString("utf8"));
    res
      .writeHead(200, { "content-type": TIPI[extname(percorso)] ?? "application/octet-stream", "content-security-policy": CSP, "cache-control": "no-cache" })
      .end(contenuto);
    return 200;
  }

  /** File sotto ui/<base>, senza uscire dalla cartella. */
  function dentro(base: string, relativo: string): string | null {
    const radice = resolve(cartella, base);
    const pieno = resolve(radice, relativo);
    return pieno.startsWith(radice + sep) ? pieno : null;
  }

  async function ambitoDi(req: IncomingMessage, url: URL): Promise<Ambito> {
    const nome = url.searchParams.get("committente") || req.headers["x-forgia-committente"];
    if (!nome || typeof nome !== "string") return TUTTI;
    const c = await trovaCommittente(amb.db, nome);
    if (!c) throw new Rifiuto(404, "Committente inesistente.");
    return di(c.id);
  }

  /** Le scritture arrivano solo dalla pagina: JSON, header custom e origine ammessa (CSRF, D5). */
  function scritturaDallaPagina(req: IncomingMessage): boolean {
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json") || req.headers["x-forgia-ui"] !== "1") return false;
    const origine = req.headers.origin;
    if (origine === undefined) return true;
    try {
      return hostAmmessi.includes(new URL(origine).hostname);
    } catch {
      return false;
    }
  }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<number> {
    const metodo = req.method ?? "GET";
    const tabella = metodo === "GET" ? LETTURE : metodo === "POST" ? SCRITTURE : [];
    const trovata = tabella.map(([re, rotta]) => [re.exec(url.pathname), rotta] as const).find(([m]) => m);
    if (!trovata) return rispondi(res, 404, { errore: "Rotta inesistente." });
    const [m, rotta] = trovata;
    let corpo: Corpo = {};
    if (metodo === "POST") {
      if (!scritturaDallaPagina(req)) return rispondi(res, 403, { errore: "Richiesta non ammessa." });
      // Un file della dashboard viaggia dentro JSON: l'escape può raddoppiarne i byte.
      const massimo = url.pathname.endsWith("/file") ? amb.config.max_file * 2 + 4096 : amb.config.max_body;
      const testo = await leggiCorpo(req, massimo).catch((errore) => {
        if (errore instanceof CorpoTroppoGrande) return null;
        throw errore;
      });
      if (testo === null) return (res.setHeader("connection", "close"), rispondi(res, 413, { errore: "Corpo troppo grande." }));
      try {
        corpo = JSON.parse(testo || "{}");
      } catch {
        return rispondi(res, 422, { errore: "Corpo non JSON." });
      }
      if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) return rispondi(res, 422, { errore: "Atteso un oggetto JSON." });
    }
    return rispondi(res, 200, await rotta(amb, await ambitoDi(req, url), Number(m?.[1]), corpo));
  }

  async function pagina(res: ServerResponse, committente: string): Promise<number> {
    return file(res, join(cartella, "static", "index.html"), (html) => html.replaceAll("{{COMMITTENTE}}", escHtml(committente)));
  }

  return async function gestisciUi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<[number, string]> {
    const p = url.pathname;
    if (amb.config.ui_certificato !== "off" && req.headers[header] !== "SUCCESS") return [rispondi(res, 403, { errore: "Serve il certificato client." }), "ui"];
    try {
      if (p.startsWith("/ui/api/")) return [await api(req, res, url), `ui ${req.method} api`];
      if (req.method !== "GET") return [rispondi(res, 405), "ui"];
      if (p === "/") return [await pagina(res, ""), "ui pagina"];
      const statico = /^\/ui\/(static|dist)\/(.+)$/.exec(p);
      if (statico) {
        const pieno = dentro(statico[1], decodifica(statico[2]));
        return [pieno ? await file(res, pieno) : rispondi(res, 404), "ui file"];
      }
      const vendor = /^\/ui\/vendor\/([^/]+)$/.exec(p);
      if (vendor) return [VENDOR[vendor[1]] ? await file(res, VENDOR[vendor[1]]) : rispondi(res, 404), "ui file"];
      const conBarra = /^\/([^/]+)\/$/.exec(p);
      // Redirect relativo: il server non conosce il prefisso che il proxy toglie (D6).
      if (conBarra) return [(res.writeHead(301, { location: `../${conBarra[1]}` }).end(), 301), "ui pagina"];
      const filtro = /^\/([^/]+)$/.exec(p);
      if (filtro) {
        const c = await trovaCommittente(amb.db, decodifica(filtro[1]));
        return [c ? await pagina(res, c.nome) : rispondi(res, 404), "ui pagina"];
      }
      return [rispondi(res, 404), "ui"];
    } catch (errore) {
      if (errore instanceof Rifiuto) return [rispondi(res, errore.codice, { errore: errore.message }), "ui"];
      throw errore;
    }
  };
}
