import * as z from "zod";
import { NOMI_RISERVATI } from "./nome.ts";

/** Chi ha associato una sessione al suo cantiere. */
export const ORIGINI = ["claude", "utente"] as const;
export type Origine = (typeof ORIGINI)[number];
/** Chi ha creato un cantiere. */
export type OrigineCantiere = Origine | "repo" | "dashboard";
export const STATI_CANTIERE = ["idea", "aperto", "sospeso", "completato", "abbandonato"] as const;
export type StatoCantiere = (typeof STATI_CANTIERE)[number];
export const STATI_FINALI: readonly StatoCantiere[] = ["completato", "abbandonato"];
export const STATI_TODO = ["pending", "in_progress", "completed", "deleted"] as const;
export type StatoSessione = "attiva" | "lavorando" | "in_attesa" | "chiusa";

export const LIMITI = {
  nome: 80,
  descrizione: 500,
  testoTodo: 500,
  resoconto: 400,
  titolo: 200,
  cwd: 1024,
  breve: 255,
  sessionId: 128,
  todo: 200,
  etichetta: 64,
} as const;

/** Errore di dominio con il codice HTTP da restituire e un messaggio per l'utente. */
export class Rifiuto extends Error {
  readonly codice: 403 | 404 | 409 | 422;
  constructor(codice: 403 | 404 | 409 | 422, messaggio: string) {
    super(messaggio);
    this.codice = codice;
  }
}

/** Segmenti di un percorso di cantieri `padre/figlio`, senza spazi ai bordi. */
export const segmenti = (percorso: string) => percorso.split("/").map((s) => s.trim());

export function slugifica(nome: string): string {
  return nome
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Nome del change OpenSpec di un cantiere: gli slug del percorso uniti da "-". */
export const nomeChange = (slugPercorso: string[]) => slugPercorso.join("-");

/** La regola kebab di OpenSpec: minuscole, cifre e trattini singoli. */
export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const nomeSemplice = (n: string) => n.length <= LIMITI.nome && slugifica(n) !== "";
const MESSAGGIO_NOME = `ogni nome deve contenere lettere o cifre, al massimo ${LIMITI.nome} caratteri`;

export const campi = {
  sessionId: z.string().min(1).max(LIMITI.sessionId),
  // Un nome di cantiere può essere un percorso `padre/figlio`: ogni segmento è un nome.
  nome: z.string().trim().min(1).max(LIMITI.breve).refine((n) => segmenti(n).every(nomeSemplice), MESSAGGIO_NOME),
  // Progetti e idee: un nome solo, senza barre.
  nomeSemplice: z.string().trim().min(1).refine((n) => !n.includes("/") && nomeSemplice(n), MESSAGGIO_NOME),
  committente: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, "solo lettere, cifre, - e _, al massimo 64 caratteri")
    .refine((n) => !NOMI_RISERVATI.includes(n.toLowerCase()), "nome riservato a una rotta del server"),
  descrizione: z.string().max(LIMITI.descrizione).nullish(),
  origineDichiarata: z.enum(ORIGINI),
  resoconto: z.string().min(1).max(LIMITI.resoconto),
  titolo: z.string().max(LIMITI.titolo).nullable(),
};

/** Errore zod in una riga, per le risposte 422 delle API. */
export const errore422 = (e: z.ZodError) => new Rifiuto(422, z.prettifyError(e));

const base = {
  evento_id: z.uuid(),
  ts: z.iso.datetime({ offset: true }).transform((ts) => new Date(ts).toISOString()),
  session_id: campi.sessionId,
  host: z.string().min(1).max(LIMITI.breve),
  cwd: z.string().max(LIMITI.cwd),
  repo: z.string().min(1).max(LIMITI.breve).nullable(),
  branch: z.string().min(1).max(LIMITI.breve).nullable(),
  progetto: z.string().min(1).max(LIMITI.breve),
};

const todo = z.strictObject({
  id: z.string().min(1).max(LIMITI.sessionId).nullable(),
  testo: z.string().max(LIMITI.testoTodo),
  stato: z.enum(STATI_TODO),
});

export const schemaEvento = z.discriminatedUnion("tipo", [
  z.strictObject({
    ...base,
    tipo: z.literal("session_start"),
    dati: z.strictObject({ source: z.enum(["startup", "resume", "clear", "compact", "tardivo"]) }),
  }),
  z.strictObject({ ...base, tipo: z.literal("prompt"), dati: z.strictObject({}) }),
  z.strictObject({
    ...base,
    tipo: z.literal("todo"),
    dati: z.strictObject({
      strumento: z.string().min(1).max(LIMITI.etichetta),
      completo: z.boolean(),
      todos: z.array(todo).max(LIMITI.todo),
    }),
  }),
  z.strictObject({
    ...base,
    tipo: z.literal("stop"),
    dati: z.strictObject({
      strumenti_nel_turno: z.number().int().min(0),
      resoconto_inviato: z.boolean(),
      bloccato: z.boolean(),
      titolo: campi.titolo,
    }),
  }),
  z.strictObject({
    ...base,
    tipo: z.literal("session_end"),
    dati: z.strictObject({ reason: z.string().max(LIMITI.etichetta), titolo: campi.titolo }),
  }),
  z.strictObject({
    ...base,
    tipo: z.literal("apri_cantiere"),
    dati: z.strictObject({
      nome: campi.nome,
      descrizione: campi.descrizione,
      origine: campi.origineDichiarata,
      padre: campi.nome.nullish(),
    }),
  }),
]);

export type EventoRest = z.infer<typeof schemaEvento>;
export interface Luogo {
  host: string;
  cwd: string;
  repo: string | null;
  branch: string | null;
}
type SenzaLuogo<T> = T extends unknown ? Omit<T, keyof Luogo> : never;
/** Evento come lo vede il dominio: il luogo (host, cwd, repo, branch) viaggia a parte. */
export type Evento = SenzaLuogo<EventoRest>;

export function separaLuogo({ host, cwd, repo, branch, ...evento }: EventoRest): [Evento, Luogo] {
  return [evento as Evento, { host, cwd, repo, branch }];
}

export const luogo = z.strictObject({ host: base.host, cwd: base.cwd, repo: base.repo, branch: base.branch });

// --- Copia dei change OpenSpec -------------------------------------------------------------------

/** File di un change che la copia può contenere (Contratto v2). */
const FILE_AMMESSI = /^(\.openspec\.yaml|proposal\.md|design\.md|tasks\.md|specs\/([^/]+\/)*[^/]+\.md|idee\/([^/]+\/)*[^/]+\.(md|txt))$/;

export const percorsoAmmesso = (p: string) => FILE_AMMESSI.test(p) && !p.split("/").some((s) => s === ".." || s === "." || s === "");

const giorno = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "atteso AAAA-MM-GG");
const nomeChangeValido = z.string().regex(KEBAB, "nome di change non kebab-case");

const fileChange = (maxFile: number) =>
  z.array(
    z.strictObject({
      percorso: z.string().refine(percorsoAmmesso, "percorso non ammesso nella copia"),
      contenuto: z.string().refine((c) => Buffer.byteLength(c) <= maxFile, `file oltre ${maxFile} byte`),
    }),
  );

export const schemaCopia = (maxFile: number) =>
  z.strictObject({
    attivi: z.array(
      z.strictObject({
        change: nomeChangeValido,
        modificato_il: z.iso.datetime({ offset: true }).transform((ts) => new Date(ts).toISOString()),
        file: fileChange(maxFile),
      }),
    ),
    archiviati: z.array(z.strictObject({ change: nomeChangeValido, archiviato_il: giorno, file: fileChange(maxFile).optional() })),
  });
export type Copia = z.infer<ReturnType<typeof schemaCopia>>;

/** Task di un tasks.md: una casella `- [x]` è fatta, ogni altra `- [...]` no (come OpenSpec). */
export function contaTask(testo: string): { fatti: number; totali: number } {
  const caselle = [...testo.matchAll(/^\s*- \[([^\]\n]{0,3})\](?=\s|$)/gm)];
  return { fatti: caselle.filter((c) => c[1].trim().toLowerCase() === "x").length, totali: caselle.length };
}
