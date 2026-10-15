import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { adesso, aggiornaStato, elencaCantieri, riceviEvento, statoSessione, type Ambiente, type Esito } from "./dominio.ts";
import { ESITI, LIMITI, ORIGINI, campi } from "./modelli.ts";
import { NOME, NOME_VISIBILE, VERSIONE } from "./nome.ts";

const sessionId = campi.sessionId.describe(
  `Il session_id di questa sessione, come scritto nel contesto ([${NOME}] session_id=...).`,
);

const esitoCantiere = z.object({
  ok: z.boolean(),
  cantiere: z
    .object({ id: z.number(), nome: z.string(), percorso: z.string(), origine: z.enum(ORIGINI), confermato: z.boolean() })
    .nullable(),
  motivo: z.string().nullable(),
});

const risultato = (testo: string, dati: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: testo }],
  structuredContent: dati,
});

function daEsito(esito: Esito, conferma: (nome: string) => string) {
  if (esito.codice === 409) {
    return risultato(`Rifiutato. ${esito.risposta.errore}`, { ok: false, cantiere: null, motivo: esito.risposta.errore });
  }
  const { cantiere } = esito.risposta;
  return risultato(cantiere ? conferma(cantiere.nome) : "Fatto: la sessione ora non ha un cantiere.", {
    ok: true,
    cantiere,
    motivo: null,
  });
}

/** Un server MCP per richiesta HTTP (modalità stateless), legato al cliente autenticato. */
export function creaServerMcp(amb: Ambiente, clienteId: number): McpServer {
  const server = new McpServer({ name: NOME, title: NOME_VISIBILE, version: VERSIONE });
  const evento = <T>(session_id: string, tipo: T) => ({ evento_id: randomUUID(), ts: adesso(), session_id, tipo });

  server.registerTool(
    "apri_cantiere",
    {
      description:
        "Associa questa sessione a un cantiere: entra nel cantiere aperto con lo stesso nome (su qualunque repo) o lo crea. " +
        "Usalo quando il cantiere della sessione è provvisorio e il lavoro è chiaramente un altro, o quando l'utente cambia argomento in modo netto. " +
        "Non usarlo per piccole variazioni dello stesso lavoro. " +
        'Nome breve e specifico (es. "oauth-logiquo"), mai generico (es. "refactoring"). ' +
        'Se il lavoro è parte di un cantiere più grande indica il padre, con padre o con un nome a percorso ("logiquo-v2/oauth"). ' +
        'origine "utente" solo se l\'utente ha nominato esplicitamente il cantiere nel turno corrente, altrimenti "claude". ' +
        "Se il cantiere l'ha scelto l'utente, il cambio viene rifiutato: non insistere.",
      inputSchema: z.object({
        session_id: sessionId,
        nome: campi.nome.describe(
          `Nome del cantiere, breve e specifico (massimo ${LIMITI.nome} caratteri); può essere un percorso padre/figlio.`,
        ),
        descrizione: campi.descrizione.describe("Una frase facoltativa su cosa riguarda il cantiere."),
        origine: campi.origineDichiarata
          .default("claude")
          .describe('"utente" solo se l\'utente ha nominato il cantiere in questo turno, altrimenti "claude".'),
        padre: campi.nome.optional().describe("Cantiere padre (anche un percorso), se questo cantiere è parte di uno più grande."),
      }),
      outputSchema: esitoCantiere,
    },
    async (a) =>
      daEsito(
        await riceviEvento(
          amb,
          clienteId,
          { ...evento(a.session_id, "apri_cantiere" as const), dati: { nome: a.nome, descrizione: a.descrizione ?? null, origine: a.origine, padre: a.padre ?? null } },
          null,
        ),
        (nome) => `Cantiere "${nome}" associato alla sessione.`,
      ),
  );

  server.registerTool(
    "aggiorna_stato",
    {
      description:
        "Registra il resoconto del turno nel giornale del cantiere. Chiamalo prima di chiudere un turno in cui hai lavorato davvero " +
        "(modifiche, comandi, analisi); non per risposte brevi senza lavoro. " +
        "fatto: cosa hai fatto; prossimo: il passo successivo. Frasi brevi, al massimo ~200 caratteri per campo. " +
        "Mai segreti, token, password, dati personali o dati dei clienti. " +
        "bloccato_da solo se c'è un blocco vero (un'attesa, un errore che non puoi risolvere, una decisione dell'utente); altrimenti omettilo.",
      inputSchema: z.object({
        session_id: sessionId,
        fatto: campi.resoconto.describe("Cosa hai fatto in questo turno, in una frase breve (~200 caratteri)."),
        prossimo: campi.resoconto.describe("Il passo successivo, in una frase breve (~200 caratteri)."),
        bloccato_da: campi.resoconto.optional().describe("Solo se c'è un blocco vero: cosa ti blocca."),
        percentuale: z.number().int().min(0).max(100).optional().describe("Stima 0-100 dell'avanzamento del cantiere, solo se ha senso."),
      }),
      outputSchema: esitoCantiere,
    },
    async (a) => {
      const cantiere = await aggiornaStato(amb, clienteId, a);
      return risultato(`Resoconto registrato${cantiere ? ` nel cantiere "${cantiere.nome}"` : ""}.`, { ok: true, cantiere, motivo: null });
    },
  );

  server.registerTool(
    "chiudi_cantiere",
    {
      description:
        "Chiude il cantiere di questa sessione per tutte le sessioni che ci lavorano, con un esito: completato, sospeso o abbandonato. " +
        "Usalo solo quando il lavoro è davvero finito o l'utente chiede di chiuderlo; non a fine turno. " +
        "Se il cantiere ha figli aperti la chiusura viene rifiutata: forza li chiude insieme, e va usato solo se l'utente l'ha chiesto. " +
        "nota: una frase facoltativa, senza segreti né dati personali.",
      inputSchema: z.object({
        session_id: sessionId,
        esito: campi.esito.describe(`Uno tra: ${ESITI.join(", ")}.`),
        nota: campi.nota.describe("Una frase facoltativa sull'esito."),
        forza: z.boolean().default(false).describe("true chiude anche i figli aperti: solo se l'utente l'ha chiesto."),
      }),
      outputSchema: esitoCantiere,
    },
    async (a) =>
      daEsito(
        await riceviEvento(
          amb,
          clienteId,
          { ...evento(a.session_id, "chiudi_cantiere" as const), dati: { esito: a.esito, nota: a.nota ?? null, forza: a.forza } },
          null,
        ),
        (nome) => `Cantiere "${nome}" chiuso.`,
      ),
  );

  server.registerTool(
    "elenca_cantieri",
    {
      description:
        "Elenca i cantieri (per default solo gli aperti, filtrabili per repo) con il percorso padre/figlio e le sessioni attive: host, branch, stato, " +
        "ultimo fatto e prossimo, età dell'ultimo evento in secondi. Serve a coordinarsi con altre sessioni o macchine prima di " +
        "toccare lo stesso lavoro; non serve a ogni turno.",
      inputSchema: z.object({
        repo: z.string().max(LIMITI.breve).optional().describe("Solo i cantieri di questo repo, es. github.com/org/repo."),
        solo_aperti: z.boolean().default(true).describe("false per includere i cantieri chiusi."),
      }),
    },
    async (a) => {
      const cantieri = await elencaCantieri(amb, { aperti: a.solo_aperti, repo: a.repo });
      return risultato(`${cantieri.length} cantieri.`, { cantieri });
    },
  );

  server.registerTool(
    "stato_sessione",
    {
      description:
        "Restituisce il cantiere corrente, l'ultimo resoconto e i todo di questa sessione. " +
        "Utile dopo una compattazione del contesto o una ripresa, per ritrovare il filo; non serve a ogni turno.",
      inputSchema: z.object({ session_id: sessionId }),
    },
    async (a) => {
      const stato = await statoSessione(amb, clienteId, a.session_id);
      return risultato(stato.cantiere ? `Cantiere "${stato.cantiere.nome}".` : "Nessun cantiere.", stato);
    },
  );

  return server;
}
