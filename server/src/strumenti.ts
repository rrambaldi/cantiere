import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { adesso, type Committente } from "./accesso.ts";
import { di } from "./ambito.ts";
import { aggiornaStato, leggiCantieri, progettoDellaSessione, riceviEvento, statoSessione, type Ambiente } from "./dominio.ts";
import { campi, LIMITI, ORIGINI, Rifiuto, STATI_CANTIERE } from "./modelli.ts";
import { NOME, NOME_VISIBILE, VERSIONE } from "./nome.ts";

const sessionId = campi.sessionId.describe(`Il session_id di questa sessione, come scritto nel contesto ([${NOME}] session_id=...).`);
const progetto = z
  .string()
  .min(1)
  .max(LIMITI.breve)
  .optional()
  .describe("Il progetto (es. poker). Serve solo se la sessione non è ancora nota al server, per esempio da claude.ai.");
const SERVE_PROGETTO = "Questa sessione non è ancora legata a un progetto: richiama il tool indicando progetto.";

const esitoCantiere = z.object({
  ok: z.boolean(),
  cantiere: z
    .object({ id: z.number(), nome: z.string(), percorso: z.string(), origine: z.enum(ORIGINI), stato: z.enum(STATI_CANTIERE), change: z.string() })
    .nullable(),
  motivo: z.string().nullable(),
});

const risultato = (testo: string, dati: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: testo }],
  structuredContent: dati,
});
const rifiuto = (motivo: string) => risultato(`Rifiutato. ${motivo}`, { ok: false, cantiere: null, motivo });

/** Un server MCP per richiesta HTTP (modalità stateless), legato al committente del token. */
export function creaServerMcp(amb: Ambiente, committente: Committente): McpServer {
  const server = new McpServer({ name: NOME, title: NOME_VISIBILE, version: VERSIONE });

  server.registerTool(
    "apri_cantiere",
    {
      description:
        "Associa questa sessione a un cantiere del suo progetto: entra nel cantiere aperto con quel percorso o lo crea, insieme al suo change OpenSpec. " +
        "Usalo quando l'utente sceglie dove va la sessione o quando il lavoro diventa chiaramente un'attività a sé; non per piccole variazioni dello stesso lavoro. " +
        'Nome breve e specifico (es. "pdfconverter"), mai generico (es. "refactoring"). ' +
        'Il percorso parte dal primo livello del progetto: per una fase di un cantiere più grande usa padre o un nome a percorso ("idoc-converter/prototipo"). ' +
        'origine "utente" solo se l\'utente ha scelto o nominato il cantiere nel turno corrente, altrimenti "claude". ' +
        "Se il change del cantiere non esiste ancora nel repo, crealo con: openspec new change <change>. " +
        "Un'idea si prende con /cantiere prendi, non con questo tool. Se il cambio viene rifiutato (scelta dell'utente, cantiere sospeso o chiuso), non insistere.",
      inputSchema: z.object({
        session_id: sessionId,
        nome: campi.nome.describe(`Nome del cantiere, breve e specifico (massimo ${LIMITI.nome} caratteri); può essere un percorso padre/figlio.`),
        descrizione: campi.descrizione.describe("Una frase facoltativa su cosa riguarda il cantiere."),
        origine: campi.origineDichiarata
          .default("claude")
          .describe('"utente" solo se l\'utente ha scelto o nominato il cantiere in questo turno, altrimenti "claude".'),
        padre: campi.nome.optional().describe("Cantiere padre (anche un percorso), se questo cantiere è una fase di uno più grande."),
        progetto,
      }),
      outputSchema: esitoCantiere,
    },
    async (a) => {
      const nomeProgetto = a.progetto ?? (await progettoDellaSessione(amb.db, committente.id, a.session_id));
      if (!nomeProgetto) return rifiuto(SERVE_PROGETTO);
      const esito = await riceviEvento(
        amb,
        committente,
        {
          evento_id: randomUUID(),
          ts: adesso(),
          session_id: a.session_id,
          progetto: nomeProgetto,
          tipo: "apri_cantiere",
          dati: { nome: a.nome, descrizione: a.descrizione ?? null, origine: a.origine, padre: a.padre ?? null },
        },
        null,
      );
      if (esito.codice !== 200) return rifiuto(esito.risposta.errore);
      const cantiere = esito.risposta.cantiere!;
      const nelRepo = await amb.db.selectFrom("change_copie").select("cantiere_id").where("cantiere_id", "=", cantiere.id).executeTakeFirst();
      const testo = `Cantiere "${cantiere.percorso}" associato alla sessione (change ${cantiere.change}).`;
      return risultato(nelRepo ? testo : `${testo} Il change non è ancora nel repo: crealo con openspec new change ${cantiere.change}.`, {
        ok: true,
        cantiere,
        motivo: null,
      });
    },
  );

  server.registerTool(
    "aggiorna_stato",
    {
      description:
        "Registra il resoconto del turno nel giornale del cantiere, o del progetto se la sessione lavora direttamente sul progetto. " +
        "Chiamalo prima di chiudere un turno in cui hai lavorato davvero (modifiche, comandi, analisi); non per risposte brevi senza lavoro. " +
        "fatto: cosa hai fatto; prossimo: il passo successivo. Frasi brevi, al massimo ~200 caratteri per campo. " +
        "Mai segreti, token, password, dati personali o dati dei clienti. " +
        "bloccato_da solo se c'è un blocco vero (un'attesa, un errore che non puoi risolvere, una decisione dell'utente); altrimenti omettilo.",
      inputSchema: z.object({
        session_id: sessionId,
        fatto: campi.resoconto.describe("Cosa hai fatto in questo turno, in una frase breve (~200 caratteri)."),
        prossimo: campi.resoconto.describe("Il passo successivo, in una frase breve (~200 caratteri)."),
        bloccato_da: campi.resoconto.optional().describe("Solo se c'è un blocco vero: cosa ti blocca."),
        percentuale: z.number().int().min(0).max(100).optional().describe("Stima 0-100 dell'avanzamento del cantiere, solo se ha senso."),
        progetto,
      }),
      outputSchema: esitoCantiere,
    },
    async (a) => {
      try {
        const cantiere = await aggiornaStato(amb, committente, a);
        return risultato(`Resoconto registrato${cantiere ? ` nel cantiere "${cantiere.percorso}"` : " nel progetto"}.`, { ok: true, cantiere, motivo: null });
      } catch (errore) {
        if (errore instanceof Rifiuto) return rifiuto(errore.message);
        throw errore;
      }
    },
  );

  server.registerTool(
    "elenca_cantieri",
    {
      description:
        "Elenca i cantieri dei tuoi progetti (per default idee, aperti e sospesi) con percorso, stato, change e avanzamento dei task, " +
        "e le sessioni attive: host, branch, stato, ultimo fatto e prossimo, età dell'ultimo evento in secondi. " +
        "Serve a scegliere dove va la sessione e a coordinarsi con altre sessioni o macchine prima di toccare lo stesso lavoro; non serve a ogni turno.",
      inputSchema: z.object({
        progetto: z.string().min(1).max(LIMITI.breve).optional().describe("Solo i cantieri di questo progetto, es. poker."),
        stati: z.array(z.enum(STATI_CANTIERE)).optional().describe("Stati da includere; per default idea, aperto e sospeso."),
      }),
    },
    async (a) => {
      const cantieri = await leggiCantieri(amb.db, amb.config, di(committente.id), { progetto: a.progetto, stati: a.stati ?? ["idea", "aperto", "sospeso"] });
      return risultato(`${cantieri.length} cantieri.`, { cantieri });
    },
  );

  server.registerTool(
    "stato_sessione",
    {
      description:
        "Restituisce progetto, cantiere corrente con il suo change, ultimo resoconto e todo di questa sessione. " +
        "Utile dopo una compattazione del contesto o una ripresa, per ritrovare il filo; non serve a ogni turno.",
      inputSchema: z.object({ session_id: sessionId }),
    },
    async (a) => {
      const stato = await statoSessione(amb, committente, a.session_id);
      const dove = stato.cantiere ? `Cantiere "${stato.cantiere.percorso}" (change ${stato.cantiere.change}).` : stato.progetto ? `Lavoro diretto su ${stato.progetto}.` : "Sessione non ancora nota.";
      return risultato(dove, stato);
    },
  );

  return server;
}
