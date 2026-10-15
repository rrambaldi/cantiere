import * as z from "zod";
import { NOME } from "./nome.ts";

export const MODALITA_RESOCONTO = ["forzato", "leggero", "off"] as const;

const schema = z.object({
  database_url: z.string().min(1).default("sqlite:forgia.db"),
  bind: z.string().regex(/^.+:\d+$/, "atteso host:porta").default("127.0.0.1:8765"),
  public_host: z.string().default(""),
  modalita_resoconto: z.enum(MODALITA_RESOCONTO).default("forzato"),
  soglia_strumenti: z.coerce.number().int().min(0).default(3),
  inattivita_minuti: z.coerce.number().int().positive().default(30),
  retention_giorni: z.coerce.number().int().positive().default(180),
  rate_limit: z.coerce.number().int().positive().default(120),
  max_body: z.coerce.number().int().positive().default(65536),
  max_openspec: z.coerce.number().int().positive().default(2_097_152),
  max_file: z.coerce.number().int().positive().default(262_144),
  max_file_idea: z.coerce.number().int().positive().default(50),
  ui_header_certificato: z.string().min(1).default("X-SSL-Client-Verify"),
  ui_certificato: z.enum(["richiesto", "off"]).default("richiesto"),
});

export type Config = z.infer<typeof schema>;

const variabile = (chiave: string) => `${NOME.toUpperCase()}_${chiave.toUpperCase()}`;

/** Legge FORGIA_<CHIAVE> dall'ambiente; il file .env lo carica Node (--env-file). */
export function leggiConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const grezzo = Object.fromEntries(
    Object.keys(schema.shape)
      .map((chiave) => [chiave, env[variabile(chiave)]])
      .filter(([, valore]) => valore !== undefined),
  );
  const esito = schema.safeParse(grezzo);
  if (esito.success) return esito.data;
  const errori = esito.error.issues.map((i) => `${variabile(String(i.path[0]))}: ${i.message}`);
  throw new Error(`Configurazione non valida. ${errori.join("; ")}`);
}
