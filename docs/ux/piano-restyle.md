# Piano di restyle: dashboard forgia
Origine: docs/ux/analisi-2026-10-20.md · commit analizzato: 961a67e
Stato del piano: approvato fino alla fase 1, fase 1 verificata
Direzione scelta: nessuna, solo interventi rapidi (analisi mirata)

## Da non toccare
- Scheda «Change» con i file formattati, copia e salva — l'informazione completa resta lì — `server/ui/src/lavori.tsx:89`
- Conteggio dei task dal file vero — `server/src/modelli.ts:203`

## Vincoli
React senza build esterna in `server/ui`, testi in `server/ui/src/testi.ts` in italiano e inglese.

## Interventi
| ID | Fase | Severità | Dove | Correzione minima | Criterio di accettazione | Stato |
|---|---|---|---|---|---|---|
| A1 | 1 rapidi | Alta | `scheda.tsx:33` | sotto la barra, i task non spuntati del `tasks.md` in `d.file`, con la stessa regola di `contaTask` | `crescita-fed-g17` mostra il 4.4 | verificato |
| M1 | 1 rapidi | Media | `lavori.tsx:38`, `testi.ts:114` | testo del giornale vuoto diverso per `origine === "repo"`, con la data di nascita | `crescita-fed-g17` mostra il testo con 15/10 | verificato |
| B1 | 1 rapidi | Bassa | `scheda.tsx:27` | valore di `origine` tradotto in `testi.ts` | niente valori grezzi, IT e EN | verificato |

## Fasi
1. Interventi rapidi — A1, M1, B1 — verifica: pagina di `crescita-fed-g17` e di un cantiere con origine dashboard.

## Verifica fase 1 (20/10/2026)
Server locale con dati di prova (il `tasks.md` vero di crescita-fed-g17, un change con 13 task aperti, un cantiere aperto da sessione), Chrome headless via CDP, 1440×900 e 390×844, IT e EN.
- A1: la scheda mostra «da fare · 4.4 Col via dell'utente, cancellare i 10 `data/crescita/fred.*.json`. Verifica: …»; con 0/13 mostra 5 task e «e altri 8».
- M1: con origine repo il giornale vuoto mostra il testo nuovo; con origine utente resta quello di prima.
- B1: origine «dal repo (openspec)», «dall'utente»; in EN «from the repo (openspec)», «by the user».
- Overflow orizzontale: nessuno. Console: nessun errore o warning.
- Revisione indipendente: 6 rilievi, corretti 6 (BOM e CRLF nel tasks.md, Markdown del task formattato, «e un altro», testo di M1 più preciso, test della UI in `server/test/ui-cantiere.test.ts`). Non trattati due casi rari: un blocco di codice rientrato sotto un task e la casella senza testo. Riverificato nel browser con il tasks.md in CRLF. Test: 143 verdi.

## Fuori piano (approvati dopo la fase 1, fatti)
- Nello «storico» il campo `da` passa da `T.origini` (`presa` → «presa con /cantiere prendi»): `scheda.tsx`, blocco storico.
- Nelle «sessioni attive», senza titolo, lo stato passa da `T.statoSessione` (`attiva` → «pronta»).
- Verifica: test `server/test/ui-cantiere.test.ts` sul markup della scheda; non riguardati nel browser (solo testo in span esistenti). Test: 144 verdi.
- I task da fare passano dalla scheda a destra a una scheda «Da fare» nella colonna centrale, prima di Giornale e Change e aperta per prima; c'è solo se restano task aperti, e li mostra tutti (21/10/2026). Verifica: test `server/test/ui-cantiere.test.ts` e screenshot del markup con `forgia.css`.
