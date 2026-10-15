import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { hostHeaderValidation, originValidation, toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod";
import { autentica, CorpoTroppoGrande, creaRateLimit, leggiCorpo, type Cliente } from "./accesso.ts";
import { elencaCantieri, elencaSessioni, riceviEvento, type Ambiente } from "./dominio.ts";
import { schemaEvento, separaLuogo } from "./modelli.ts";
import { VERSIONE_CONTRATTO } from "./nome.ts";
import { creaServerMcp } from "./strumenti.ts";

/** Una riga per richiesta: solo tipo, session_id, cliente ed esito, mai token o testi. */
export type Log = (riga: { tipo: string; session_id?: string; cliente: string | null; esito: number }) => void;
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

export function creaApp(amb: Ambiente, log: Log = logJson): Server {
  const consentito = creaRateLimit(amb.config.rate_limit);
  const host = [amb.config.public_host, "127.0.0.1", "localhost", "[::1]"].filter(Boolean);
  const hostValido = hostHeaderValidation(host);
  const originValido = originValidation(host);
  // responseMode di default ("auto"): risposta JSON, perché i tool non mandano notifiche durante la chiamata.
  const mcp = toNodeHandler(createMcpHandler(({ authInfo }) => creaServerMcp(amb, Number(authInfo?.clientId))));

  /** [codice, corpo, evento ricevuto per il log] */
  async function api(metodo: string, url: URL, corpo: string, cliente: Cliente): Promise<[number, Corpo, { tipo: string; session_id: string }?]> {
    const percorso = `${metodo} ${url.pathname}`;
    const filtro = url.searchParams;
    switch (percorso) {
      case "GET /api/v1/salute":
        return [200, { ok: true, versione_contratto: VERSIONE_CONTRATTO, cliente: cliente.nome }];
      case "GET /api/v1/cantieri":
        return [200, { cantieri: await elencaCantieri(amb, { aperti: filtro.get("aperti") === "1" }) }];
      case "GET /api/v1/sessioni":
        return [200, { sessioni: await elencaSessioni(amb, { attive: filtro.get("attive") === "1" }) }];
      case "POST /api/v1/eventi": {
        const valido = schemaEvento.safeParse(json(corpo));
        if (!valido.success) return [422, { errore: z.prettifyError(valido.error) }];
        const [evento, luogo] = separaLuogo(valido.data);
        const { codice, risposta } = await riceviEvento(amb, cliente.id, evento, luogo);
        return [codice, risposta, evento];
      }
    }
    return [404, null];
  }

  async function gestisci(req: IncomingMessage & { auth?: AuthInfo }, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const metodo = req.method ?? "GET";
    const perMcp = url.pathname === "/mcp";
    if (!perMcp && !url.pathname.startsWith("/api/v1/")) return rispondi(res, 404);
    if (perMcp && !(hostValido(req, res) && originValido(req, res))) return; // la guardia ha già risposto 403

    const cliente = await autentica(amb.db, req.headers.authorization);
    let esito: number;
    let tipo = url.pathname;
    let sessionId: string | undefined;
    if (!cliente) {
      esito = 401;
      rispondi(res, esito);
    } else if (!consentito(cliente.id)) {
      esito = 429;
      rispondi(res, esito, { errore: "Troppe richieste: riprova tra un minuto." });
    } else {
      const corpo =
        metodo !== "POST"
          ? ""
          : await leggiCorpo(req, amb.config.max_body).catch((errore) => {
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
        // Il token in chiaro si ferma qui: al server MCP arriva solo l'id del cliente.
        req.auth = { token: "", clientId: String(cliente.id), scopes: [] };
        await mcp(req, res, messaggio);
        esito = res.statusCode;
      } else {
        const [codice, risposta, evento] = await api(metodo, url, corpo, cliente);
        rispondi(res, codice, risposta);
        esito = codice;
        tipo = evento?.tipo ?? tipo;
        sessionId = evento?.session_id;
      }
    }
    log({ tipo, session_id: sessionId, cliente: cliente?.nome ?? null, esito });
  }

  return createServer((req, res) => {
    gestisci(req, res).catch((errore: Error) => {
      console.error(`errore interno: ${errore.name}: ${errore.message}`);
      if (res.headersSent) res.destroy();
      else rispondi(res, 500, { errore: "Errore interno." });
    });
  });
}
