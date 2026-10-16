import { locale, T } from "./testi.js";
const stessoGiorno = (a, b) => a.toDateString() === b.toDateString();
export function giorno(iso) {
    const d = new Date(iso);
    const oggi = new Date();
    const ieri = new Date(oggi.getTime() - 86_400_000);
    if (stessoGiorno(d, oggi))
        return T.oggi;
    if (stessoGiorno(d, ieri))
        return T.ieri;
    return d.toLocaleDateString(locale, { day: "numeric", month: "short", ...(d.getFullYear() === oggi.getFullYear() ? {} : { year: "numeric" }) });
}
export const ora = (iso) => new Date(iso).toTimeString().slice(0, 5);
export const quando = (iso) => `${giorno(iso)} ${ora(iso)}`;
export function eta(secondi) {
    if (secondi < 60)
        return T.adesso;
    if (secondi < 3600)
        return T.minFa(Math.floor(secondi / 60));
    if (secondi < 86_400)
        return T.oreFa(Math.floor(secondi / 3600));
    return T.giorniFa(Math.floor(secondi / 86_400));
}
export const VISTA_DI = {
    idea: "idee",
    aperto: "aperti",
    sospeso: "aperti",
    completato: "chiusi",
    abbandonato: "chiusi",
};
export const finale = (s) => s === "completato" || s === "abbandonato";
/** Profondità nell'albero dei cantieri del progetto: 0 per il primo livello. */
export const profondita = (c) => c.percorso.split("/").length - 1;
