export const NOME = "forgia";
export const NOME_VISIBILE = "cantiere forgia";
export const VERSIONE = "0.2.0";
export const VERSIONE_CONTRATTO = 2;
export const PREFISSO = `[${NOME}]`;

/** Primo segmento di ogni rotta del server: un committente non può chiamarsi così (D4). */
export const ROTTE = { api: "/api/v1/", mcp: "/mcp", ui: "/ui/" } as const;
export const NOMI_RISERVATI = Object.keys(ROTTE);
