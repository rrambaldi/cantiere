import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { hostHeaderValidation, originValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { autentica, CorpoTroppoGrande, creaRateLimit, leggiCorpo, type Committente } from "./accesso.ts";
import { di } from "./ambito.ts";
import { creaProgetto, elencaProgetti, elencaSessioni, formaProgetto, leggiCantieri, riceviEvento, type Ambiente } from "./dominio.ts";
import { dirama, prendi } from "./idee.ts";
import { errore422, Rifiuto, schemaEvento, segmenti, separaLuogo } from "./modelli.ts";
import { ROTTE, VERSIONE_CONTRATTO } from "./nome.ts";
import { riceviCopia } from "./openspec.ts";
import { creaServerMcp } from "./strumenti.ts";
import { CARTELLA_UI, creaUi } from "./ui.ts";

/** Una riga per richiesta: solo tipo, session_id, committente ed esito, mai token, testi o nomi di cantieri. */
export type Log = (riga: { tipo: string; session_id?: string; committente: string | null; esito: number }) => void;
const logJson: Log = (riga) => console.log(JSON.stringify(riga));

type Corpo = object | null;

function rispondi(res: ServerResponse, codice: number, corpo: Corpo = null) {
  if (corpo === null) {
    res.writeHead(codice).end();
  } else {
    res.writeHead(codice, { "content-type": "application/json" }).end(JSON.stringify(corpo));
  }
}

function json(testo: string): unknown {
  try {
    return JSON.parse(testo);
  } catch {
    return undefined;
  }
}

// Rotte con il progetto nell'URL: la copia dei change, la presa di un'idea e un ramo verso il progetto.
const ROTTA_COPIA = /^\/api\/v1\/progetti\/([^/]+)\/openspec$/;
const ROTTA_PRESA = /^\/api\/v1\/progetti\/([^/]+)\/cantieri\/(.+)\/prendi$/;
const ROTTA_RAMI = /^\/api\/v1\/progetti\/([^/]+)\/rami$/;
const decodifica = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    throw new Rifiuto(404, "Percorso non valido.");
  }
};

export function creaApp(amb: Ambiente, log: Log = logJson, cartellaUi = CARTELLA_UI): Server {
  const consentito = creaRateLimit(amb.config.rate_limit);
  const host = [amb.config.public_host, "127.0.0.1", "localhost", "[::1]"].filter(Boolean);
  const hostValido = hostHeaderValidation(host);
  const originValido = originValidation(host);
  const ui = creaUi(amb, cartellaUi, host);
  // responseMode di default ("auto"): risposta JSON, perché i tool non mandano notifiche durante la chiamata.
  const mcp = toNodeHandler(
    createMcpHandler(({ authInfo }) => creaServerMcp(amb, { id: Number(authInfo?.clientId), nome: String(authInfo?.extra?.nome) })),
  );

  /** [codice, corpo, tipo per il log, session_id per il log] */
  async function api(metodo: string, url: URL, corpo: string, committente: Committente): Promise<[number, Corpo, string, string?]> {
    const percorso = `${metodo} ${url.pathname}`;
    const filtro = url.searchParams;
    const ambito = di(committente.id);
    const progetto = filtro.get("progetto") ?? undefined;
    switch (percorso) {
      case "GET /api/v1/salute":
        return [200, { ok: true, versione_contratto: VERSIONE_CONTRATTO, cliente: committente.nome }, percorso];
      case "GET /api/v1/cantieri":
        return [200, { cantieri: await leggiCantieri(amb.db, amb.config, ambito, { progetto, stati: filtro.get("aperti") === "1" ? ["aperto"] : undefined }) }, percorso];
      case "GET /api/v1/sessioni": {
        const sessioni = await elencaSessioni(amb.db, amb.config, ambito, { progetto, attive: filtro.get("attive") === "1" });
        return [200, { sessioni: sessioni.map(({ cantiere_id, progetto_id, ...s }) => s) }, percorso];
      }
      case "GET /api/v1/progetti":
        return [200, { progetti: await elencaProgetti(amb.db, ambito) }, percorso];
      case "POST /api/v1/progetti": {
        const nome = (json(corpo) as { nome?: unknown } | undefined)?.nome;
        return [200, { progetto: formaProgetto(await creaProgetto(amb.db, committente.id, typeof nome === "string" ? nome : "")) }, percorso];
      }
      case "POST /api/v1/eventi": {
        const valido = schemaEvento.safeParse(json(corpo));
        if (!valido.success) throw errore422(valido.error);
        const [evento, luogo] = separaLuogo(valido.data);
        const { codice, risposta } = await riceviEvento(amb, committente, evento, luogo);
        return [codice, risposta, evento.tipo, evento.session_id];
      }
    }
    const copia = ROTTA_COPIA.exec(url.pathname);
    if (copia && metodo === "PUT") return [200, { cantieri: await riceviCopia(amb, committente, decodifica(copia[1]), json(corpo)) }, "PUT openspec"];
    const presa = ROTTA_PRESA.exec(url.pathname);
    if (presa && metodo === "POST") {
      const nomi = segmenti(presa[2]).map(decodifica);
      const corpoPresa = json(corpo);
      const risposta = await prendi(amb, committente, decodifica(presa[1]), nomi, corpoPresa);
      return [200, risposta, "POST prendi", (corpoPresa as { session_id?: string } | undefined)?.session_id];
    }
    const rami = ROTTA_RAMI.exec(url.pathname);
    if (rami && metodo === "POST") {
      const corpoRamo = json(corpo);
      return [200, { cantiere: await dirama(amb, committente, decodifica(rami[1]), corpoRamo) }, "POST rami", (corpoRamo as { session_id?: string } | undefined)?.session_id];
    }
    return [404, null, percorso];
  }

  async function gestisci(req: IncomingMessage & { auth?: AuthInfo }, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const metodo = req.method ?? "GET";
    const perMcp = url.pathname === ROTTE.mcp;
    if (!perMcp && !url.pathname.startsWith(ROTTE.api)) {
      const [esito, tipo] = await ui(req, res, url);
      return log({ tipo, committente: null, esito });
    }
    if (perMcp && !(hostValido(req, res) && originValido(req, res))) return; // la guardia ha già risposto 403

    const committente = await autentica(amb.db, req.headers.authorization);
    let esito: number;
    let tipo = perMcp ? "mcp" : `${metodo} api`;
    let sessionId: string | undefined;
    if (!committente) {
      esito = 401;
      rispondi(res, esito);
    } else if (!consentito(committente.id)) {
      esito = 429;
      rispondi(res, esito, { errore: "Troppe richieste: riprova tra un minuto." });
    } else {
      const massimo = ROTTA_COPIA.test(url.pathname) ? amb.config.max_openspec : amb.config.max_body;
      const corpo =
        metodo !== "POST" && metodo !== "PUT"
          ? ""
          : await leggiCorpo(req, massimo).catch((errore) => {
              if (errore instanceof CorpoTroppoGrande) return null;
              throw errore;
            });
      if (corpo === null) {
        esito = 413;
        res.setHeader("connection", "close");
        rispondi(res, esito, { errore: "Corpo troppo grande." });
      } else if (perMcp) {
        const messaggio = json(corpo) as { method?: string; params?: { name?: string; arguments?: { session_id?: string } } } | undefined;
        tipo = ["mcp", messaggio?.method, messaggio?.params?.name].filter(Boolean).join(" ");
        sessionId = messaggio?.params?.arguments?.session_id;
        // Il token in chiaro si ferma qui: al server MCP arriva solo il committente.
        req.auth = { token: "", clientId: String(committente.id), scopes: [], extra: { nome: committente.nome } };
        await mcp(req, res, messaggio);
        esito = res.statusCode;
      } else {
        try {
          const [codice, risposta, tipoApi, sessione] = await api(metodo, url, corpo, committente);
          rispondi(res, codice, risposta);
          [esito, tipo, sessionId] = [codice, tipoApi, sessione];
        } catch (errore) {
          if (!(errore instanceof Rifiuto)) throw errore;
          esito = errore.codice;
          rispondi(res, esito, { errore: errore.message });
        }
      }
    }
    log({ tipo, session_id: sessionId, committente: committente?.nome ?? null, esito });
  }

  return createServer((req, res) => {
    gestisci(req, res).catch((errore: Error) => {
      console.error(`errore interno: ${errore.name}: ${errore.message}`);
      if (res.headersSent) res.destroy();
      else rispondi(res, 500, { errore: "Errore interno." });
    });
  });
}
