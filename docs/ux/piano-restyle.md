# Piano di restyle: dashboard forgia, mappa dei cantieri
Origine: docs/ux/analisi-2026-10-26.md · commit analizzato: e52fd71 · change OpenSpec: mappa-cantieri (fase 3)
Stato del piano: fasi 1, 2 e 3 verificate (27/10/2026); fase 4 da fare
Direzione scelta: P4 «Dal task ai rami» nel cantiere e P2 «Binari nel tempo» nel committente; P3 «Quadro ad albero» come forma dei binari al telefono — https://claude.ai/artifact/BAFGvGafLts3RnVWBL8DCA
Il piano precedente (navigazione-dashboard, interventi M1-M4 A1 A2, tutti verificati) è nella storia di git, commit c9a05d3.

## Già fatto (fasi 1 e 2 del change, commit 8cf6ca6)
- A1, A2: legami registrati e citati nel server, `nato_da` in ogni cantiere dell'albero, anche tra progetti; `/cantiere dirama`.
- M3 (dati): subagenti contati per sessione, in `sessioni[].subagenti`.

## Da non toccare
- Stati per forma (pieno, rombo, anello) — `server/ui/src/ds/feedback.tsx:7`
- Avanzamento dal tasks.md vero — `server/src/modelli.ts` `contaTask`, componente `Avanzamento` in `server/ui/src/ui.tsx`
- Navigazione a una colonna, percorso, scelta nell'hash, telefono a una schermata — `indice.tsx`, `app.tsx` (piano precedente)
- Schede del cantiere «Da fare», «Giornale», «Change» — `server/ui/src/lavori.tsx`
- Privacy: al server mai prompt né descrizioni dei subagenti

## Vincoli
React senza build esterna (`tsc -p server/ui`, `ui/dist` nel repo), niente stili in linea nell'HTML (CSP), testi in `server/ui/src/testi.ts` in italiano e inglese, token in `server/ui/static/forgia.css`, icone Lucide ridisegnate in `server/ui/src/ui.tsx`. I dati vengono da `ui/api/albero` e `ui/api/cantieri/<id>`: niente rotte nuove salvo dove scritto.

## Interventi
| ID | Fase | Severità | Dove | Correzione minima | Criterio di accettazione | Stato |
|---|---|---|---|---|---|---|
| R1 | 1 cantiere | Alta | `lavori.tsx` `LavoroCantiere`, `app.tsx` | scheda «Task e rami»: in testa «nato da → questo → rami» (con progetto se diverso); sotto, i task di `tasks.md` (fatti e da fare, con il numero) e accanto a ciascuno i cantieri nati da quel task, con stato, avanzamento, tipo (citato tratteggiato) e clic che li apre; i rami senza task in testa | in `multi-instrument-simulations` con `basket-mix` citato dal task 1.1: `basket-mix` accanto a 1.1 con 7/8; un clic lo apre | verificato |
| R2 | 1 cantiere | Media | `scheda.tsx` sessioni attive del cantiere | subagenti accanto a ogni sessione attiva: «3 subagenti · 2 Explore · 1 general-purpose» | una sessione con subagenti li mostra; senza, niente riga | verificato |
| B1 | 2 committente | Alta | `lavori.tsx` `LavoroCommittente`, nuovo `binari.tsx`, `forgia.css` | scheda «Binari»: asse dei giorni (12, 30, tutto), una corsia per progetto, un binario per cantiere non idea: giallo fino all'ultimo aggiornamento, puntini grigi fino a oggi con «fermo N g» da 3 giorni, pallino carta alla chiusura; idea presa più tardi: rombo e linea sottile fino alla presa; rami sotto la partenza con il tratto dal suo binario, monconi con il nome verso altri progetti; ore locali | i 6 aperti di PRIV fermi da più di 7 giorni dicono «fermo N g»; `basket-mix` sta sotto `multi-instrument-simulations` | verificato |
| B2 | 3 telefono | Media | `binari.tsx`, `forgia.css` | a ≤720 px la scheda «Binari» è il quadro ad albero: una riga per cantiere con `└─` per i rami, stato, task, ultimo aggiornamento | a 390×844 nessuno scorrimento orizzontale | verificato |
| N1 | 4 scheda | Media | `scheda.tsx`, `server/src/ui.ts` | «nato da» nella scheda del cantiere: si aggiunge (scelta di un cantiere del committente) e si toglie; rotta UI che scrive o cancella un legame registrato | aggiunto dalla scheda, il legame compare in «Task e rami»; tolto, sparisce | da fare |

## Fasi
1. Cantiere — R1 R2 — verifica: server locale con dati a forma di quelli veri (legame citato da task, legame tra progetti), 1440×900, clic veri su un ramo; console pulita.
2. Committente — B1 — verifica: dati di PRIV, DGT e CVSTUDIO dal file `albero.json` dell'utente; 1440×900 e 1100×800.
3. Telefono — B2 — 390×844 senza scorrimento orizzontale.
4. Scheda — N1, con i test della rotta.

## Regole anti-regressione
- Ogni visita dei legami ricorda i cantieri già visti: un giro resta possibile (design di mappa-cantieri, rischi).
- Giallo solo per il lavoro che si muove; fermo è grigio a puntini. Testo secondario su `--superficie` in `--prussia-200`, non `--testo-2` (4.12:1).
- Ore e giorni nel fuso del browser.
- Un ramo verso un altro progetto non attraversa le corsie: è un moncone con il nome.
- Nomi a capo nelle liste; nei binari tagliati con «…» e il nome intero nel `title`.

## Verifica fase 1 (26/10/2026)
Server locale con dati a forma di quelli veri (PRIV: parity-deriva con i `tasks.md` e le proposte veri di `multi-instrument-simulations` e `basket-mix`, un ramo verso `mercurius/info-extra-per-stocks` da `/cantiere dirama` con task 2.4, tre subagenti sulla sessione), Chrome headless via DevTools Protocol con clic veri alle coordinate, in italiano.
- R1: scheda «Task e rami 2»; `basket-mix` 7/8 tratteggiato «citato» accanto al task 1.1, `mercurius / info-extra-per-stocks` accanto al 2.4; in testa «Nessuno» e «2 rami accanto ai loro task». Clic su `basket-mix`: si apre, indirizzo `#/PRIV/parity-deriva/basket-mix`, e la sua scheda dice «nato da multi-instrument-simulations, dal task 1.1, 0/13, citato».
- R2: nella scheda tecnica «3 subagenti · 2 Explore · 1 general-purpose» sotto la sessione.
- 1440×900, 1100×800, 390×844: nessuno scorrimento orizzontale; al telefono il ramo va sotto il suo task, rientrato. Console senza errori. Bersagli sotto 24 px: 0.
- Test: `server/test/ui-cantiere.test.ts` (righe di tasks.md, rami accanto ai task e in testa, clic che apre, subagenti); suite intera verde.
- Nuovo problema, fuori dal piano: nella scheda tecnica `--testo-2` (#9DB0CC) su `--superficie` (#24487F) è 4.12:1, 18 occorrenze (etichette e nomi dei campi). Correzione proposta: `--prussia-200` per il testo secondario dentro `.scheda`.

## Verifica fase 2 (27/10/2026)
Server locale con i dati veri di PRIV, DGT e CVSTUDIO presi da `ui/api/albero` della dashboard pubblicata (date comprese) e la copia vera dei change di parity-deriva, che fa nascere il legame citato `multi-instrument-simulations` → `basket-mix`; Chrome headless via DevTools Protocol, clic veri, in italiano.
- B1: scheda «Binari» nella pagina del committente, accanto a «Progetti». PRIV: 4 corsie, 24 binari, 6 «fermo N g» (9-11 giorni in cantiere, crescita-fed-g17 11 g), `basket-mix` sotto `multi-instrument-simulations` con il tratto tratteggiato, sessioni «mine · al lavoro» e «mine · turno finito». DGT: 5 corsie, 17 binari, 12 fermi, `mn02` annidato sotto `manuali installazione`, idee prese più tardi col rombo e la linea sottile (SALVATAGGIO CONFIGURAZIONI, opzioni di accesso). CVSTUDIO: 2 corsie, 3 binari, 2 fermi. Progetti senza binari in fondo.
- Finestre 12, 30 giorni e tutto: l'asse cambia (27 set con 30 giorni, 15 ott con tutto). Clic su `basket-mix`: si apre, indirizzo `#/PRIV/parity-deriva/basket-mix`.
- 1440×900 e 1100×800: nessuno scorrimento orizzontale, né della pagina né del riquadro; il disegno prende la larghezza del riquadro al pixel, testo a 12 px. Bersagli sotto 24 px: 0 (righe da 24 px). Console senza errori. Contrasto: l'unica coppia sotto soglia resta quella già nota della scheda tecnica.
- Corretti durante la verifica: disegno più largo del riquadro (si vedeva tagliato «oggi»), nomi sottolineati come link, rombo dell'idea presa sui completati.
- Test: `server/test/ui-binari.test.ts` (intervalli, corsie, rami e monconi, fasi, giri, disegno); suite intera 207/207.
- Al telefono il riquadro scorre di lato (il disegno sta sopra i 720 px): è la fase 3, quadro ad albero.

## Verifica fase 3 (27/10/2026)
Stesso server locale con i dati veri, Chrome headless a 390×844 con tocchi veri.
- B2: a ≤720 px la scheda «Binari» è il quadro ad albero: una sezione per progetto con il riepilogo, una riga per cantiere con stato, task, «fermo N g» o il giorno dell'ultimo aggiornamento e la sessione; `└─ basket-mix` e `└─ mn02` rientrati sotto il loro cantiere. Disegno e legenda nascosti, le finestre restano.
- PRIV e DGT: nessuno scorrimento orizzontale, nessun elemento fuori, bersagli sotto 24 px: 0 (righe da 44 px), nessun contrasto sotto soglia. Tocco su `mn02`: si apre, indirizzo `#/DGT/digithera/manuali installazione/mn02`. A 1440 px resta il disegno. Console senza errori.
- Test: quadro in `server/test/ui-binari.test.ts`; suite intera verde.
