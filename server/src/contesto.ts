import { PREFISSO } from "./nome.ts";
import type { Origine, StatoCantiere } from "./modelli.ts";

export interface CantiereRisposta {
  id: number;
  nome: string;
  /** Catena dei nomi dal primo livello del progetto, separati da "/". */
  percorso: string;
  origine: Origine;
  stato: StatoCantiere;
  change: string;
}

const CONFERMA = `${PREFISSO} Comando /cantiere gestito`;
const MASSIMO_ELENCO = 10;

/** Al massimo 10 percorsi, i più recenti per primi (l'elenco arriva già ordinato). */
function elenco(percorsi: string[], vuoto: string): string {
  if (!percorsi.length) return vuoto;
  const altri = percorsi.length - MASSIMO_ELENCO;
  return percorsi.slice(0, MASSIMO_ELENCO).join(", ") + (altri > 0 ? ` e altri ${altri}` : "");
}

export interface DatiAvvio {
  sessionId: string;
  committente: string;
  progetto: string;
  cantiere: { percorso: string; origine: Origine } | null;
  aperti: string[];
  idee: string[];
  daArchiviare: string[];
  conResoconto: boolean;
}

export function contestoAvvio(d: DatiAvvio): string {
  const righe = [
    `${PREFISSO} session_id=${d.sessionId}`,
    `Progetto: ${d.committente}/${d.progetto}`,
    `Cantiere: ${d.cantiere ? `${d.cantiere.percorso} (${d.cantiere.origine})` : "nessuno, lavoro diretto sul progetto"}`,
    `Cantieri aperti: ${elenco(d.aperti, "nessuno")}`,
    `Idee: ${elenco(d.idee, "nessuna")}`,
  ];
  if (d.daArchiviare.length) righe.push(`Da archiviare: ${d.daArchiviare.join(", ")}`);
  const regole = [];
  if (!d.cantiere) {
    regole.push(
      '- Al primo messaggio dell\'utente, prima di rispondere, chiedi con una domanda a scelta dove va questa sessione: un cantiere aperto, un\'idea (si prende con /cantiere prendi <percorso>), un cantiere nuovo (apri_cantiere con origine "utente"), oppure lavoro diretto sul progetto.',
    );
  }
  // Con il resoconto spento, in un cantiere non resta nessuna regola: anche questa è tracciamento.
  if (d.cantiere && d.conResoconto) {
    regole.push(
      '- Se l\'utente fa partire da un task di questo cantiere un\'attività a sé: se la sessione passa a lavorarci, apri_cantiere con origine "utente" e task (il numero in tasks.md) registra il legame da solo; per farne partire una o più senza lasciare questo cantiere, proponi /cantiere dirama <progetto>/<nome> --task <numero>.',
    );
  }
  for (const change of d.daArchiviare) {
    regole.push(`- Proponi all'utente di archiviare ${change} con: openspec archive ${change} --skip-specs --yes`);
  }
  if (d.conResoconto) {
    regole.push(
      "- Prima di chiudere un turno in cui hai lavorato, chiama aggiorna_stato: fatto, prossimo, bloccato_da. Frasi brevi; mai segreti, dati personali o dati dei clienti.",
    );
  }
  if (regole.length) righe.push("Regole:", ...regole);
  return righe.join("\n");
}

export const avvisoNonAperto = (percorso: string, stato: StatoCantiere, progetto: string) =>
  `${PREFISSO} Il cantiere ${percorso} è ${stato}: ora lavori direttamente su ${progetto}. Dillo all'utente in una riga.`;

// Il testo di un task viene dal tasks.md del repo: nel contesto ne basta l'inizio.
const MAX_TESTO_TASK = 300;
const task = (numero: string, testo: string | null) => `task ${numero}${testo ? ` «${testo.slice(0, MAX_TESTO_TASK)}»` : ""}`;

export const confermaFork = (percorso: string, change: string, partenza: string, numero: string, testo: string | null, assente: boolean) =>
  `${CONFERMA}: fork "${percorso}" aperto da "${partenza}", ${task(numero, testo)}.${assente ? ` Il task ${numero} non c'è nella copia di tasks.md che ha il server: se il numero è sbagliato dillo all'utente.` : ""} Scrivi openspec/changes/${change}/ con proposal.md e tasks.md a partire da quel task, come /opsx:propose, piccolo (design e spec solo se il task li chiede), poi lavoraci. Quando lo archivi la sessione torna da sola in "${partenza}", al task ${numero}. Rispondi all'utente con una sola riga di conferma, poi scrivi il change.`;

export const avvisoRitorno = (fork: string, stato: StatoCantiere, partenza: string, numero: string | null, testo: string | null) =>
  `${PREFISSO} Il fork ${fork} è ${stato}: la sessione è tornata in ${partenza}.${numero ? ` Riprendi dal ${task(numero, testo)}.` : ""} Dillo all'utente in una riga.`;

export const confermaApertura = (percorso: string, change: string) =>
  `${CONFERMA}: cantiere "${percorso}" aperto (change ${change}). Rispondi all'utente con una sola riga di conferma.`;

export type EsitoWeb = "confermato" | "negato";

/** Il comando che porta alla sessione l'esito di una verifica dato dalla dashboard (design D9). */
export const esitoTask = (task: string, esito: EsitoWeb, feedback: string) =>
  esito === "confermato"
    ? `Verifica del task "${task}" confermata dal web: smarca il task nel tasks.md.`
    : `Verifica del task "${task}" negata dal web, il task resta aperto. Lavora su questo feedback: ${feedback}`;

/** L'esito di una domanda; `chi` dice quale sessione l'ha fatta, perché può riceverlo un'altra del cantiere (design D10). */
export const esitoDomanda = (domanda: string, chi: string, esito: EsitoWeb, feedback: string) =>
  esito === "confermato"
    ? `Alla domanda "${domanda}" (${chi}) dal web rispondono: confermo.`
    : `Alla domanda "${domanda}" (${chi}) dal web rispondono: non va. Lavora su questo feedback: ${feedback}`;
