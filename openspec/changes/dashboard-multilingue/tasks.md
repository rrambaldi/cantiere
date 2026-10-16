# Tasks

## 1. Base

- [x] 1.1 Creare `server/ui/src/testi.ts` con i dizionari `it` ed `en` e il tipo delle chiavi; verifica: `npm run typecheck` fallisce se una chiave manca in `en`.
- [ ] 1.2 Aggiungere `impostaLingua` e lo stato lingua in `app.tsx` (stato lingua, scelta iniziale da `localStorage` poi `navigator.language`, salvataggio, aggiornamento di `<html lang>` e del titolo); verifica: con `navigator.language` francese parte in italiano, con inglese parte in inglese.
- [ ] 1.3 Selettore di lingua (IT / EN) nell'intestazione; verifica: il cambio è immediato e sopravvive al ricaricamento.

## 2. Stringhe

- [x] 2.1 Portare `formato.ts` (giorno, ora, età, etichette di stato) sulla lingua con `Intl`; verifica: "ieri"/"yesterday", "3 h fa"/"3 h ago".
- [x] 2.2 Sostituire le stringhe in `app.tsx`, `indice.tsx`, `scheda.tsx`, `ui.tsx`; verifica: nessun testo italiano fisso nei file.
- [x] 2.3 Sostituire le stringhe in `lavori.tsx`, `dialoghi.tsx`, `documento.tsx` e i testi d'errore in `api.ts`; verifica: idem.
- [x] 2.4 Usare la lingua corrente in `localeCompare` di `indice.tsx`; verifica: ordinamento invariato in italiano.

## 3. Chiusura

- [x] 3.1 Cercare testo italiano rimasto in `server/ui/src/**/*.tsx` (grep su accenti e parole comuni); verifica: solo nel dizionario.
- [ ] 3.2 Aprire la dashboard in entrambe le lingue e controllare viste, dialoghi e layout; verifica: nessun testo troncato o misto.
- [x] 3.3 `npm run build:ui` e `npm test` in `server/`; verifica: test verdi, incluso `ui-compilato`.
- [x] 3.4 Aggiornare `server/README.md` con la lingua della dashboard; verifica: una riga che spiega selettore e predefinito.
