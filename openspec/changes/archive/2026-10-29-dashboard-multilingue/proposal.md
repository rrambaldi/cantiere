# Proposal

## Why

La dashboard parla solo italiano, con le stringhe scritte dentro i componenti. Chi non legge
l'italiano (colleghi, committenti esteri) non può usarla.

## What Changes

- La dashboard si può usare in italiano e in inglese; l'italiano resta la lingua predefinita.
- Un selettore di lingua nell'intestazione; la scelta resta nel browser. Alla prima visita vale la
  lingua del browser, se è inglese o italiano.
- Etichette, pulsanti, dialoghi, messaggi di errore dell'interfaccia, date ed età ("oggi", "2 h fa")
  seguono la lingua scelta; l'attributo `lang` della pagina pure.
- I dati restano come scritti: nomi, note, idee, resoconti e file dei change OpenSpec non si traducono.
- Le stringhe escono dai componenti e vanno in un dizionario per lingua.

## Capabilities

### New Capabilities

### Modified Capabilities
- `server/dashboard`: la dashboard MUST offrire italiano e inglese, con scelta e memoria della lingua.

## Impact

- `server/ui/src/*` (tutti i componenti, `formato.ts`), nuovo dizionario in `server/ui/src/`,
  `server/ui/static/index.html`, `server/ui/dist/` ricompilato.
- Nessuna modifica a API, database, plugin o contratto. Nessuna nuova dipendenza.
- Fuori scopo: tradurre le risposte dell'API, i messaggi dei tool MCP, il plugin, i dati degli utenti;
  altre lingue oltre a italiano e inglese (il dizionario le rende possibili dopo).
