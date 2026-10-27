import { T } from "./testi.js";
const BASE = "ui/api/";
/** Nome del committente della vista ristretta, scritto dal server nella pagina; vuoto per la vista di tutti. */
export function committenteDellaPagina() {
    const valore = document.querySelector('meta[name="forgia-committente"]')?.content ?? "";
    return valore.includes("{{") ? "" : valore; // pagina aperta senza passare dal server
}
function intestazioni(scrittura) {
    const h = { Accept: "application/json" };
    if (scrittura)
        Object.assign(h, { "Content-Type": "application/json", "X-Forgia-UI": "1" });
    const committente = committenteDellaPagina();
    if (committente)
        h["X-Forgia-Committente"] = committente;
    return h;
}
async function richiesta(percorso, corpo) {
    const scrittura = corpo !== undefined;
    let risposta;
    try {
        risposta = await fetch(BASE + percorso, {
            method: scrittura ? "POST" : "GET",
            headers: intestazioni(scrittura),
            body: scrittura ? JSON.stringify(corpo) : undefined,
            credentials: "same-origin",
        });
    }
    catch {
        throw new Error(T.serverNonRaggiungibile);
    }
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok) {
        if (risposta.status === 403)
            throw new Error(T.accessoNegato);
        throw new Error(dati?.errore ?? T.erroreHttp(risposta.status));
    }
    return dati;
}
export const api = {
    albero: (committente) => richiesta("albero" + (committente ? `?committente=${encodeURIComponent(committente)}` : "")),
    cantiere: (id) => richiesta(`cantieri/${id}`),
    nonCensite: (progetto) => richiesta(`progetti/${progetto}/non-censite`),
    creaCommittente: (nome) => richiesta("committenti", { nome }),
    rigeneraToken: (committente) => richiesta(`committenti/${committente}/rigenera`, {}),
    creaProgetto: (committente, nome) => richiesta(`committenti/${committente}/progetti`, { nome }),
    creaIdea: (progetto, idea) => richiesta(`progetti/${progetto}/idee`, idea),
    modificaIdea: (cantiere, campi) => richiesta(`cantieri/${cantiere}/modifica`, campi),
    caricaFile: (cantiere, nome, contenuto) => richiesta(`cantieri/${cantiere}/file`, { nome, contenuto }),
    togliFile: (cantiere, nome) => richiesta(`cantieri/${cantiere}/file/elimina`, { nome }),
    mettiNatoDa: (cantiere, da, task) => richiesta(`cantieri/${cantiere}/nato-da`, { da, task }),
    togliNatoDa: (cantiere, da) => richiesta(`cantieri/${cantiere}/nato-da/togli`, { da }),
    esito: (cantiere, azione) => richiesta(`cantieri/${cantiere}/esito`, { azione }),
    scriviComando: (session_id, testo) => richiesta("comandi", { session_id, testo }),
    annullaComando: (id) => richiesta(`comandi/${id}/annulla`, {}),
    esitoDomanda: (d, e) => richiesta("domande/esito", { session_id: d.session_id, domanda_id: d.id, ...e }),
    esitoTask: (cantiere, task, e) => richiesta(`cantieri/${cantiere}/verifica`, { task, ...e }),
};
