import { T } from "./testi.ts";

// API JSON della dashboard (design D16): URL relativi, così funzionano sotto qualunque prefisso del proxy.

export type Stato = "idea" | "aperto" | "sospeso" | "completato" | "abbandonato";
export type OrigineCantiere = "claude" | "utente" | "repo" | "dashboard";
/** Chi ha cambiato lo stato di un cantiere: un'origine, o "presa" per un'idea presa con /cantiere prendi. */
export type AutoreEsito = OrigineCantiere | "presa";
/** "inattiva" la calcola il server in lettura: nessun evento da troppo tempo. */
export type StatoSessione = "attiva" | "lavorando" | "in_attesa" | "inattiva" | "chiusa";

export interface SessioneAttiva {
  session_id: string;
  host: string;
  branch: string | null;
  stato: StatoSessione;
  titolo: string | null;
  fatto: string | null;
  prossimo: string | null;
  eta_secondi: number;
  /** Subagenti lanciati, per tipo. */
  subagenti: Record<string, number>;
}

export interface Domanda {
  id: string;
  session_id: string;
  tipo: "scelta" | "attesa";
  testo: string;
  opzioni: string[];
  host: string;
  ts: string;
  eta_secondi: number;
}

export interface Cantiere {
  id: number;
  progetto: string;
  nome: string;
  percorso: string;
  padre_id: number | null;
  stato: Stato;
  origine: OrigineCantiere;
  change: string;
  descrizione: string | null;
  creato_il: string;
  aggiornato_il: string;
  artefatti: { proposal: boolean; design: boolean; specs: boolean; tasks: boolean } | null;
  task: { fatti: number; totali: number } | null;
  fasi: { completate: number; totali: number } | null;
  change_mancante: boolean;
  da_archiviare: boolean;
  file_idea: number;
  /** Domande in attesa nel cantiere e nei suoi discendenti. */
  domande_in_attesa: number;
  /** Solo quelle del cantiere stesso. */
  domande: Domanda[];
  sessioni: SessioneAttiva[];
  /** I cantieri da cui è nato, anche di altri progetti dello stesso committente. */
  nato_da: { id: number; progetto: string; percorso: string; task: string | null; tipo: "registrato" | "citato" }[];
}

export interface Progetto {
  id: number;
  nome: string;
  slug: string;
  creato_il: string;
  non_censite: number;
  domande_in_attesa: number;
  cantieri: Cantiere[];
}

export interface Committente {
  id: number;
  nome: string;
  creato_il: string;
  token_il: string;
  progetti: Progetto[];
}

export interface Turno {
  ts: string;
  session_id: string;
  host: string;
  titolo: string | null;
  fatto: string;
  prossimo: string;
  bloccato_da: string | null;
  percentuale: number | null;
}

export interface FileCopia {
  percorso: string;
  contenuto: string;
}

export interface Dettaglio {
  cantiere: Cantiere;
  turni: Turno[];
  file: FileCopia[];
  task_aperti: string[];
  todo: { session_id: string; host: string; testo: string; stato: string }[];
  esiti: { stato: Stato; ts: string; da: AutoreEsito }[];
  discendenti_attivi: string[];
}

export interface NonCensita {
  session_id: string;
  titolo: string | null;
  host: string;
  avviata_il: string;
  ultimo_evento_il: string;
  turni: number;
  stato: StatoSessione;
  ultimo_stato: { ts: string; fatto: string; prossimo: string; bloccato_da: string | null } | null;
}

export type Azione = "sospendi" | "riattiva" | "abbandona";

const BASE = "ui/api/";

/** Nome del committente della vista ristretta, scritto dal server nella pagina; vuoto per la vista di tutti. */
export function committenteDellaPagina(): string {
  const valore = document.querySelector<HTMLMetaElement>('meta[name="forgia-committente"]')?.content ?? "";
  return valore.includes("{{") ? "" : valore; // pagina aperta senza passare dal server
}

function intestazioni(scrittura: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (scrittura) Object.assign(h, { "Content-Type": "application/json", "X-Forgia-UI": "1" });
  const committente = committenteDellaPagina();
  if (committente) h["X-Forgia-Committente"] = committente;
  return h;
}

async function richiesta<T>(percorso: string, corpo?: unknown): Promise<T> {
  const scrittura = corpo !== undefined;
  let risposta: Response;
  try {
    risposta = await fetch(BASE + percorso, {
      method: scrittura ? "POST" : "GET",
      headers: intestazioni(scrittura),
      body: scrittura ? JSON.stringify(corpo) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new Error(T.serverNonRaggiungibile);
  }
  const dati = await risposta.json().catch(() => null);
  if (!risposta.ok) {
    if (risposta.status === 403) throw new Error(T.accessoNegato);
    throw new Error(dati?.errore ?? T.erroreHttp(risposta.status));
  }
  return dati as T;
}

export const api = {
  albero: (committente: string) =>
    richiesta<{ release: string; committenti: Committente[] }>("albero" + (committente ? `?committente=${encodeURIComponent(committente)}` : "")),
  cantiere: (id: number) => richiesta<Dettaglio>(`cantieri/${id}`),
  nonCensite: (progetto: number) => richiesta<{ sessioni: NonCensita[] }>(`progetti/${progetto}/non-censite`),
  creaCommittente: (nome: string) => richiesta<{ committente: Committente; token: string }>("committenti", { nome }),
  rigeneraToken: (committente: number) => richiesta<{ token: string }>(`committenti/${committente}/rigenera`, {}),
  creaProgetto: (committente: number, nome: string) =>
    richiesta<{ progetto: Progetto }>(`committenti/${committente}/progetti`, { nome }),
  creaIdea: (progetto: number, idea: { nome: string; descrizione: string | null; padre_id: number | null }) =>
    richiesta<{ cantiere: Cantiere }>(`progetti/${progetto}/idee`, idea),
  modificaIdea: (cantiere: number, campi: { nome: string; descrizione: string | null }) =>
    richiesta<{ cantiere: Cantiere }>(`cantieri/${cantiere}/modifica`, campi),
  caricaFile: (cantiere: number, nome: string, contenuto: string) =>
    richiesta<{ file: { nome: string; byte: number } }>(`cantieri/${cantiere}/file`, { nome, contenuto }),
  togliFile: (cantiere: number, nome: string) => richiesta<object>(`cantieri/${cantiere}/file/elimina`, { nome }),
  esito: (cantiere: number, azione: Azione) => richiesta<{ cantieri: Cantiere[] }>(`cantieri/${cantiere}/esito`, { azione }),
};
