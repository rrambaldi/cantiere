// Date brevi, orari 24h e conteggi asciutti, come vuole il design system.
import type { Cantiere, Stato } from "./api.ts";
import { locale, T } from "./testi.ts";

const stessoGiorno = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function giorno(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date();
  const ieri = new Date(oggi.getTime() - 86_400_000);
  if (stessoGiorno(d, oggi)) return T.oggi;
  if (stessoGiorno(d, ieri)) return T.ieri;
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", ...(d.getFullYear() === oggi.getFullYear() ? {} : { year: "numeric" }) });
}

export const ora = (iso: string) => new Date(iso).toTimeString().slice(0, 5);

export const quando = (iso: string) => `${giorno(iso)} ${ora(iso)}`;

export function eta(secondi: number): string {
  if (secondi < 60) return T.adesso;
  if (secondi < 3600) return T.minFa(Math.floor(secondi / 60));
  if (secondi < 86_400) return T.oreFa(Math.floor(secondi / 3600));
  return T.giorniFa(Math.floor(secondi / 86_400));
}

export type Vista = "aperti" | "idee" | "chiusi";

export const VISTA_DI: Record<Stato, Vista> = {
  idea: "idee",
  aperto: "aperti",
  sospeso: "aperti",
  completato: "chiusi",
  abbandonato: "chiusi",
};

export const finale = (s: Stato) => s === "completato" || s === "abbandonato";

/** Profondità nell'albero dei cantieri del progetto: 0 per il primo livello. */
export const profondita = (c: Cantiere) => c.percorso.split("/").length - 1;
