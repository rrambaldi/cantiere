## Why

Nella dashboard si naviga male: l'indice a sinistra è un albero lungo con i nomi tagliati, dal centro non si risale al progetto, le colonne laterali non si chiudono e il tasto Indietro del browser esce dalla pagina. Analisi in `docs/ux/analisi-2026-10-22.md`, direzione scelta D2 (cascata a una colonna).

## What Changes

- Colonna di sinistra a una colonna: committenti → progetti → cantieri, un livello alla volta, con «‹» per tornare su e i filtri aperti/idee/chiusi dentro il progetto.
- La colonna si chiude in una rotaia «sfoglia», anche da sola dopo la scelta di un cantiere (la puntina la tiene aperta); la scheda tecnica a destra si apre e si chiude. Lo stato resta al ricaricamento.
- Percorso sopra il titolo del centro: ogni segmento sceglie quel livello e riapre la colonna.
- Poi: la scelta nell'indirizzo (Indietro e link), e la colonna al telefono.

## Impact

- `server/ui/src/indice.tsx`, `app.tsx`, `lavori.tsx`, `ui.tsx`, `ds/core.tsx`, `testi.ts`, `server/ui/static/forgia.css`, `server/ui/dist`.
- Spec `server/dashboard`. Nessuna modifica al server né alle API.
