# Piano di restyle: dashboard forgia, navigazione
Origine: docs/ux/analisi-2026-10-22.md · commit analizzato: cac4cab
Stato del piano: fasi 1, 2 e 3 verificate (22/10/2026)
Direzione scelta: D2 · cascata a una colonna — https://claude.ai/artifact/8hLCoDG8RtDFkyGvHmhh4s
Il piano precedente (analisi del 20/10, interventi A1 M1 B1, tutti verificati) è nella storia di git.

## Da non toccare
- Stati per forma (pieno, rombo, anello) — `server/ui/src/ds/feedback.tsx:7`
- Scheda «Change» con i file formattati, copia e salva — `server/ui/src/lavori.tsx`
- Conteggio dei task dal file vero — `server/src/modelli.ts:203`
- Scegliere un cantiere porta il filtro sul suo stato (aperti, idee, chiusi) — `server/ui/src/app.tsx:138`
- I figli seguono il padre, con il rientro; un orfano mostra il percorso intero — `server/ui/src/indice.tsx:15`, `:111`
- Pallino delle domande in attesa, conteggio delle attività non censite e delle sessioni — `server/ui/src/indice.tsx`
- Lingua IT/EN, doppio clic sul committente per la sua pagina, «Nuovo committente» solo fuori dalla vista ristretta

## Vincoli
React senza build esterna (`tsc -p server/ui`, `ui/dist` nel repo), niente stili in linea nell'HTML (CSP), testi in `server/ui/src/testi.ts` in italiano e inglese, token in `server/ui/static/forgia.css`, icone Lucide ridisegnate in `server/ui/src/ui.tsx`.

## Interventi
| ID | Fase | Severità | Dove | Correzione minima | Criterio di accettazione | Stato |
|---|---|---|---|---|---|---|
| M2 | 1 struttura | Media | `indice.tsx` | colonna a una colonna: committenti → progetti → cantieri, un livello alla volta, «‹» torna su, filtri aperti/idee/chiusi con i conteggi del progetto | da `navigazione-dashboard`: «‹ PRIV» mostra i 4 progetti, `mercurius` mostra i suoi cantieri | verificato |
| M1 | 1 struttura | Media | `forgia.css` `.nome-cantiere` | nomi a capo, colonna 304 px | «aggiungiamo predizioni con Timestral-209M» intero su due righe | verificato |
| M3 | 1 struttura | Media | `app.tsx`, `indice.tsx`, `forgia.css` | colonna che si chiude in una rotaia «sfoglia» (anche da sola dopo la scelta di un cantiere, salvo puntina) e scheda destra apribile e chiudibile; stato ricordato | a 1440 px con colonna e scheda chiuse il centro va da 56 px al bordo destro; al ricaricamento resta così | verificato |
| A1 | 1 struttura | Alta | `lavori.tsx` `Testata` | percorso sopra il titolo: committente / progetto / padri / cantiere; ogni segmento sceglie quel livello e riapre la colonna | da `navigazione-dashboard` un clic su `cantiere` mostra il progetto e i suoi cantieri nella colonna | verificato |
| A2 | 2 indirizzo | Alta | `app.tsx` | scelta nell'hash, letta all'avvio e su `hashchange` | tre scelte e tre Indietro le ripercorrono; un link con l'hash apre quel cantiere | verificato |
| M4 | 3 telefono | Media | `forgia.css`, `indice.tsx` | a ≤720 px un livello per schermata, scheda come foglio dal basso | a 390×844 nessuno scorrimento orizzontale, la colonna non copre il contenuto | verificato |

## Fasi
1. Struttura al desktop — M2 M1 M3 A1 — verifica: server locale con i dati di prova, 1440×900 e 1100×800, clic veri su «‹», filtri, cantiere, puntina, «sfoglia», segmenti del percorso, bottone della scheda; console pulita; 390×844 senza scorrimento orizzontale.
2. Indirizzo — A2.
3. Telefono — M4.

## Regole anti-regressione
- Ogni colonna richiudibile ha il suo bottone con nome accessibile; lo stato si ricorda in localStorage con un valore predefinito se manca.
- Nell'indice niente `white-space:nowrap` sui nomi: vanno a capo.
- Il percorso nel centro viene dalla stessa scelta dell'indice, non da una seconda copia dello stato.
- Al telefono (≤720 px, la stessa soglia in `forgia.css` e in `app.tsx`) una schermata alla volta: niente che si apra sopra il centro all'avvio, e lo stato aperto lì non si ricorda.

## Verifica fase 1 (22/10/2026)
Server locale con dati di prova a forma dei dati veri (PRIV: cantiere, mercurius, parity-deriva con un figlio `multi-instrument-simulations/basket-mix`, poker vuoto), Chrome headless via CDP con clic veri, in italiano.
- M2: da `navigazione-dashboard` «‹ PRIV» mostra i 4 progetti e il centro non cambia; `mercurius` mostra i suoi cantieri (aperti 1, idee 4, chiusi 1); «Idee» mostra le 4 idee.
- M1: «aggiungiamo predizioni con Timestral-209M» va a capo su due righe nella colonna da 304 px.
- M3: scelta un'idea con la puntina spenta la colonna diventa la rotaia «sfoglia» (centro da 56 px); con la puntina accesa resta aperta. Colonna e scheda chiuse: il centro va da 56 a 1440 px; al ricaricamento restano chiuse; «sfoglia» e il bottone della scheda le riaprono.
- A1: il segmento `mercurius` sceglie il progetto e riapre la colonna sui suoi cantieri; per `basket-mix` il percorso è `PRIV / parity-deriva / multi-instrument-simulations / basket-mix`.
- Misure (misure.js): nessuno scorrimento orizzontale né testo tagliato a 1440, 1100, 768 e 390 px; a 390 nessun bersaglio sotto 24 px (i segmenti del percorso erano 22 px, ora 25); focus da tastiera con contorno giallo; console senza errori né warning. Contrasto: nella colonna e nel percorso nessuna coppia sotto soglia; resta #9DB0CC su #24487F (4,12:1) nelle etichette della scheda tecnica, che questa fase non tocca (vedi Proposte).
- Test: `server/test/ui-navigazione.test.ts` (8 casi con clic in jsdom); suite intera 160 verdi, compreso il controllo che `ui/dist` sia la compilazione di `ui/src`.
- Revisione indipendente: 8 rilievi. Corretti 6: doppio clic per la pagina del committente spostato sul titolo del livello progetti (la riga spariva al primo clic); pallino sulle domande rimaste fuori dal livello, su «‹»; fuoco da tastiera al titolo del livello nuovo o a «sfoglia»; puntina con nome fisso e `aria-pressed`; animazione che non riparte ai ridisegni; test più stretti (conteggi del progetto, orfano, vista ristretta, percorso con i padri, fuoco). Scartati: il segmento radice «committenti» nel percorso (al centro non c'è una pagina dei committenti; si torna su con «‹»), l'avanzamento nelle righe (è nel mock D2 scelto), le regole della rotaia a ≤720 px (senza, la rotaia al telefono diventa una striscia verticale a tutta larghezza). Tolta la correzione di contrasto della scheda, fuori dal compito: rendeva quasi uguali i todo fatti e quelli da fare.

## Verifica fase 2 (22/10/2026)
Stesso server locale, Chrome headless via CDP. L'indirizzo è `#/committente/progetto/padre/cantiere`, un nome per segmento, codificato.
- Aperta senza indirizzo, la scelta predefinita va nell'indirizzo senza aggiungere passi alla cronologia; «‹» nella colonna non aggiunge passi.
- Tre scelte (`mercurius`, l'idea `aggiungiamo predizioni con Timestral-209M`, il segmento `mercurius`) aggiungono tre passi; tre Indietro le ripercorrono fino a `navigazione-dashboard`, Avanti torna a `mercurius`.
- Il link `#/PRIV/parity-deriva/multi-instrument-simulations/basket-mix` apre il figlio; `#/PRIV/mercurius/analisi%20%22sperequazioni%22` apre l'idea con le virgolette; cambiando l'indirizzo a mano la scelta lo segue; `#/PRIV/nulla` lascia la scelta ricordata e riscrive l'indirizzo.
- Console senza errori né warning. Test: 9 casi in `ui-navigazione.test.ts` (indirizzo andata e ritorno, indirizzi sbagliati) e 4 in `ui-app.test.ts`, che monta l'App intera in jsdom con fetch finto (link, tre scelte e tre Indietro, indirizzo sbagliato a pagina aperta, altra codifica); suite intera 165 verdi.
- Revisione indipendente: 5 rilievi, tutti corretti. Una risposta in ritardo per la scelta di prima copriva quella del link (il centro restava vuoto fino a 30 s): ora si scarta. Un indirizzo che non porta a niente, a pagina aperta, torna quello della scelta. Lo stesso indirizzo in un'altra codifica non aggiunge passi. Test dell'App intera, prima rossi e poi verdi. Requisito «Scelta nell'indirizzo» nella spec del change.

## Verifica fase 3 (22/10/2026)
Stesso server locale (più un cantiere col nome lunghissimo senza trattini), Chrome headless via CDP a 390×844 con tocchi veri (eventi del mouse alle coordinate) e tasti veri.
- All'apertura, con colonna, puntina e scheda ricordate aperte dal desktop, si vede il centro: colonna chiusa nella barra «sfoglia» (alta 56 px), scheda chiusa. Quello che si apre al telefono non cambia il valore ricordato per il desktop.
- «sfoglia» apre la colonna a tutto schermo (844 px su 844, centro nascosto); «‹ PRIV», `mercurius`, «Idee», un'idea: un livello per schermata, il fuoco sul titolo del livello; scelta l'idea la colonna si chiude e il fuoco va a «sfoglia». La puntina al telefono non c'è.
- La scheda sale dal basso (da 357 a 844 px) come dialogo sopra un velo; la pagina sotto è `inert`. Aperta con Invio, il fuoco va sulla X; Tab e Maiusc+Tab girano solo tra i bottoni del foglio (e la barra del browser). Si chiude con la X, con un tocco sul velo e con Esc, e il fuoco torna al bottone «Apri la scheda tecnica», anche dopo una «Nuova idea» creata dal foglio (la pagina sotto è cambiata); con il dialogo «Nuova idea» aperto sopra, Esc non la chiude, e girando il telefono (844×390) il fuoco resta nel campo del dialogo.
- Il segmento `mercurius` del percorso apre la colonna a tutto schermo sui suoi cantieri, con il fuoco sul titolo del livello. Il percorso lungo di `basket-mix` va a capo con la «/» a fine riga.
- Finestra a 1440 px con puntina e scheda aperte, poi stretta a 683 px: colonna e scheda si chiudono, scegliere un cantiere chiude la colonna; di nuovo a 1440 px tornano colonna, puntina e scheda di prima.
- Misure (misure.js): a 390 e a 683 nessuno scorrimento orizzontale, anche col nome lunghissimo come cantiere o come padre nel percorso (i segmenti vanno a capo); nessun testo tagliato (solo i testi per lettori di schermo); nessun bersaglio sotto 24 px; contrasto sotto soglia solo nelle etichette della scheda tecnica (4,12:1, vedi Proposte). A 1440, 1100 e 768 px niente velo né foglio, puntina visibile, Esc non chiude la scheda, nessuno scorrimento orizzontale. Console senza errori né warning.
- Test: `server/test/ui-telefono.test.ts` (7 casi: avvio, foglio con pagina inerte e fuoco che entra ed esce, velo ed Esc, dialogo aperto dal foglio, niente ricordato e cambio di larghezza, fuoco reso dopo un cambio di pagina, fuoco che resta nel dialogo allargando), un caso in `ui-app.test.ts` (al desktop Esc non chiude la scheda), due in `ui-navigazione.test.ts` (la «/» chiude i segmenti; la colonna aperta da fuori prende il fuoco rimasto nel vuoto), sul montaggio comune `server/test/app-finta.ts`; tolta dal codice compilato una correzione alla volta, il suo test fallisce. Suite intera 174 verdi.
- Revisione indipendente: 5 rilievi, tutti corretti. Il fuoco usciva dal foglio con Maiusc+Tab e non tornava al bottone chiudendolo: ora il foglio è un dialogo fuori dalla griglia, la pagina sotto è `inert`, e la X sta nel foglio invece che in ogni scheda. Dopo un segmento del percorso il fuoco finiva nel vuoto: ora va al titolo del livello. Lo stato del telefono si leggeva solo all'avvio (stringendo la finestra con la puntina accesa la colonna non si chiudeva più): ora la larghezza si segue, con uno stato per il desktop, ricordato, e uno per il telefono, che riparte chiuso. Test sulla «/» a fine segmento. `.sotto` va a capo anche nei nomi senza trattini.
- Secondo giro, sulle correzioni: confermate le cinque, 3 rilievi nuovi, tutti corretti. I segmenti del percorso non andavano a capo (un padre col nome lunghissimo faceva scorrere la pagina a 595 px): ora vanno a capo, allineati a sinistra. Il fuoco tornava al bottone di quando il foglio si era aperto, che dopo una «Nuova idea» non c'era più; e allargando la finestra con un dialogo aperto dal foglio, il fuoco usciva dal dialogo: ora lo rende l'App, al bottone di adesso, e solo se il foglio lo chiude chi lo usa (X, velo, Esc).

## Fuori piano (fatti durante la verifica della fase 1)
- I numeri a destra della voce scelta passano a `--prussia-200`: `--testo-2` su `--superficie-alta` restava sotto 4,5:1.

## Proposte (non fatte)
- Scheda tecnica: `--testo-2` (#9DB0CC) su `--superficie` (#24487F) sta a 4,12:1 nelle etichette e nei `dt`. Correzione da decidere insieme ai todo fatti (`scheda.tsx:73`), che oggi si distinguono proprio per quel colore.
- Nelle righe dei cantieri della pagina di un progetto i nomi lunghi finiscono ancora coi puntini (`.riga-cantiere .nome`), come succedeva nell'indice.
