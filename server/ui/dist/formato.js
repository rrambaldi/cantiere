const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const stessoGiorno = (a, b) => a.toDateString() === b.toDateString();
export function giorno(iso) {
    const d = new Date(iso);
    const oggi = new Date();
    const ieri = new Date(oggi.getTime() - 86_400_000);
    if (stessoGiorno(d, oggi))
        return "oggi";
    if (stessoGiorno(d, ieri))
        return "ieri";
    return `${d.getDate()} ${MESI[d.getMonth()]}` + (d.getFullYear() === oggi.getFullYear() ? "" : ` ${d.getFullYear()}`);
}
export const ora = (iso) => new Date(iso).toTimeString().slice(0, 5);
export const quando = (iso) => `${giorno(iso)} ${ora(iso)}`;
export function eta(secondi) {
    if (secondi < 60)
        return "adesso";
    if (secondi < 3600)
        return `${Math.floor(secondi / 60)} min fa`;
    if (secondi < 86_400)
        return `${Math.floor(secondi / 3600)} h fa`;
    return `${Math.floor(secondi / 86_400)} g fa`;
}
export const ETICHETTA_STATO = {
    idea: "idea",
    aperto: "in corso",
    sospeso: "sospeso",
    completato: "completato",
    abbandonato: "abbandonato",
};
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
