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

export const confermaApertura = (percorso: string, change: string) =>
  `${CONFERMA}: cantiere "${percorso}" aperto (change ${change}). Rispondi all'utente con una sola riga di conferma.`;
