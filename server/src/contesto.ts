import { NOME, PREFISSO } from "./nome.ts";
import type { Origine } from "./modelli.ts";

export interface CantiereRisposta {
  id: number;
  nome: string;
  /** Catena dei nomi dal cantiere più alto, separati da "/". */
  percorso: string;
  origine: Origine;
  confermato: boolean;
}

const CONFERMA = `${PREFISSO} Comando /cantiere gestito`;
const UNA_RIGA = "Rispondi all'utente con una sola riga di conferma.";

export function contestoAvvio(sessionId: string, c: CantiereRisposta, conResoconto: boolean): string {
  const righe = [
    `${PREFISSO} session_id=${sessionId}`,
    `Cantiere: ${c.percorso} (${c.origine}, ${c.confermato ? "confermato" : "provvisorio"})`,
    "Regole:",
    `- Cantiere provvisorio e lavoro chiaramente diverso? Chiama apri_cantiere (server MCP ${NOME}, origine "claude") con un nome breve e specifico.`,
    "- Se l'utente cambia argomento in modo netto, fai lo stesso.",
  ];
  if (conResoconto) {
    righe.push(
      "- Prima di chiudere un turno in cui hai lavorato, chiama aggiorna_stato: fatto, prossimo, bloccato_da. Frasi brevi; mai segreti, dati personali o dati dei clienti.",
    );
  }
  return righe.join("\n");
}

export const hintProvvisorio = (nome: string) =>
  `${PREFISSO} Cantiere provvisorio: ${nome}. Se non corrisponde al lavoro, apri_cantiere.`;

export const confermaApertura = (percorso: string, id: number) =>
  `${CONFERMA}: cantiere "${percorso}" aperto (id ${id}). ${UNA_RIGA}`;

export const confermaChiusura = (percorso: string, esito: string, figli: string[]) =>
  `${CONFERMA}: cantiere "${percorso}" chiuso (esito ${esito})${figli.length ? `, con i figli ${figli.join(", ")}` : ""}. ${UNA_RIGA}`;

export const nienteDaChiudere = () => `${CONFERMA}: nessun cantiere da chiudere. ${UNA_RIGA}`;
