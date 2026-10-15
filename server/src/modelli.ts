import * as z from "zod";

export const ORIGINI = ["auto", "claude", "utente"] as const;
export type Origine = (typeof ORIGINI)[number];
export const ESITI = ["completato", "sospeso", "abbandonato"] as const;
export const STATI_TODO = ["pending", "in_progress", "completed", "deleted"] as const;
export type StatoSessione = "attiva" | "lavorando" | "in_attesa" | "chiusa";

export const LIMITI = {
  nome: 80,
  descrizione: 500,
  nota: 500,
  testoTodo: 500,
  resoconto: 400,
  cwd: 1024,
  breve: 255,
  sessionId: 128,
  todo: 200,
  etichetta: 64,
} as const;

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

export const campi = {
  sessionId: z.string().min(1).max(LIMITI.sessionId),
  // Un nome può essere un percorso `padre/figlio`: ogni segmento è un nome di cantiere.
  nome: z
    .string()
    .trim()
    .min(1)
    .max(LIMITI.breve)
    .refine(
      (n) => segmenti(n).every((s) => s.length <= LIMITI.nome && slugifica(s) !== ""),
      `ogni nome deve contenere lettere o cifre, al massimo ${LIMITI.nome} caratteri`,
    ),
  descrizione: z.string().max(LIMITI.descrizione).nullish(),
  origineDichiarata: z.enum(["utente", "claude"]),
  esito: z.enum(ESITI),
  nota: z.string().max(LIMITI.nota).nullish(),
  resoconto: z.string().min(1).max(LIMITI.resoconto),
};

const base = {
  evento_id: z.uuid(),
  ts: z.iso.datetime({ offset: true }).transform((ts) => new Date(ts).toISOString()),
  session_id: campi.sessionId,
  host: z.string().min(1).max(LIMITI.breve),
  cwd: z.string().max(LIMITI.cwd),
  repo: z.string().min(1).max(LIMITI.breve).nullable(),
  branch: z.string().min(1).max(LIMITI.breve).nullable(),
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
    }),
  }),
  z.strictObject({
    ...base,
    tipo: z.literal("session_end"),
    dati: z.strictObject({ reason: z.string().max(LIMITI.etichetta) }),
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
  z.strictObject({
    ...base,
    tipo: z.literal("chiudi_cantiere"),
    dati: z.strictObject({ esito: campi.esito, nota: campi.nota, forza: z.boolean().default(false) }),
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
