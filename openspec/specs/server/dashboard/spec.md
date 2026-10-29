# server/dashboard Specification

## Purpose
Dà all'amministratore una pagina web per vedere committenti, progetti e cantieri con lo stato vero
dei loro change, e per far nascere il lavoro: committenti, token, progetti e idee.

## Requirements

### Requirement: Dashboard servita dal server
Il server MUST servire la dashboard su `/` (tutti i committenti) e su `/<committente>` (un
committente solo), i suoi file statici sotto `/ui/` e le sue API JSON sotto `/ui/api/`. La pagina
MUST funzionare anche quando il reverse proxy la pubblica sotto un prefisso e lo toglie.

#### Scenario: Pubblicata sotto un prefisso
- **WHEN** nginx pubblica il server su `https://priv.progettazionisoftware.it/cantiere/` togliendo `/cantiere`
- **THEN** la dashboard si apre su `/cantiere/` e carica file e dati sotto `/cantiere/ui/`

### Requirement: Certificato confermato dal proxy
Ogni richiesta alla dashboard e alle sue API MUST portare l'header configurato in
`ui_header_certificato` (default `X-SSL-Client-Verify`) con valore `SUCCESS`, altrimenti MUST
ricevere 403. Un Bearer token MUST non bastare per la dashboard.

#### Scenario: Senza certificato
- **WHEN** arriva `GET /` senza l'header, oppure con l'header a `NONE`
- **THEN** il server risponde 403

#### Scenario: Token di un committente sulla dashboard
- **WHEN** arriva `GET /ui/api/committenti` con il Bearer di `PRIV` e senza l'header del certificato
- **THEN** il server risponde 403

#### Scenario: Certificato confermato
- **WHEN** arriva `GET /` con `X-SSL-Client-Verify: SUCCESS`
- **THEN** il server risponde 200 con la dashboard

### Requirement: Filtro per committente
`/<committente>` MUST aprire la dashboard ristretta a quel committente, con il nome confrontato
senza distinzione di maiuscole. Un committente inesistente o un percorso più profondo MUST dare 404.
Nella vista ristretta MUST non comparire la creazione di committenti.

#### Scenario: Committente in minuscolo
- **WHEN** si apre `/cantiere/priv` e il committente si chiama `PRIV`
- **THEN** la dashboard mostra solo i progetti e i cantieri di `PRIV`

#### Scenario: Percorso sotto il committente
- **WHEN** si apre `/cantiere/PRIV/mercurius`
- **THEN** il server risponde 404

### Requirement: Viste
La dashboard MUST mostrare l'albero committenti → progetti → cantieri con stato e avanzamento, il
giornale dei turni di un cantiere, gli artefatti del suo change e i file delle idee in sola lettura,
i todo delle sue sessioni attive in sola lettura e, per ogni progetto, le attività non censite.

#### Scenario: Giornale di un cantiere
- **WHEN** si sceglie `poker/idoc-converter/prototipo`, con tre resoconti da due macchine
- **THEN** il giornale mostra i tre turni dal più recente, con ora, host, fatto, prossimo e blocco

#### Scenario: Ultimo stato di un'attività non censita
- **WHEN** si fa doppio click (o Invio) sulla riga di un'attività non censita
- **THEN** sotto la riga compare l'ultimo messaggio di stato della sessione, con ora, fatto, prossimo e blocco, oppure la nota che non ce n'è ancora; un altro doppio click lo chiude
- **AND** la colonna dello stato dice con forma e parola se la sessione è al lavoro, ha finito il turno, è pronta, è ferma o è terminata

#### Scenario: Change di un cantiere
- **WHEN** si sceglie un cantiere con una copia del change
- **THEN** la dashboard mostra proposal, design, specs e tasks formattati, con il contenuto dell'ultima copia del repo, e i task spuntati sul totale

### Requirement: Markdown formattato
I file `.md` dei change e delle idee MUST comparire formattati: titoli, paragrafi, elenchi, tabelle,
grassetto e corsivo, codice in linea e a blocchi, citazioni, collegamenti e le caselle dei task come
caselle spuntate o vuote, in sola lettura. I file `.txt` MUST comparire come testo semplice che
conserva gli a capo.

#### Scenario: Design di un change
- **WHEN** si apre il `design.md` di un change con titoli, una tabella, un blocco di codice e un elenco
- **THEN** la dashboard li mostra come titoli, tabella, blocco di codice ed elenco, non come testo con i simboli Markdown

#### Scenario: Task di un change
- **WHEN** si apre un `tasks.md` con `- [x] 1.1 ...` e `- [ ] 1.2 ...`
- **THEN** la 1.1 compare con la casella spuntata e la 1.2 con la casella vuota, e cliccarle non cambia nulla

#### Scenario: Copia e salva di un file
- **WHEN** si apre un file di un change o di un'idea, per esempio `specs/server/git/spec.md`
- **THEN** sopra il file ci sono due pulsanti a icona, con il nome nel tooltip: "Copia negli appunti" copia il testo così com'è, con i simboli Markdown, e "Salva sul computer" lo scarica come `specs-server-git-spec.md`
- **AND** sui file di un change, che sono la copia del repo, non ci sono i pulsanti "Modifica" e "Togli"

#### Scenario: File di testo di un'idea
- **WHEN** si apre il file `appunti.txt` di un'idea
- **THEN** compare come testo semplice con gli stessi a capo del file

### Requirement: Markdown senza codice eseguibile
La formattazione MUST mostrare come testo l'HTML scritto nei file, MUST non rendere attivi i
collegamenti con schema diverso da `http`, `https` e `mailto` e MUST aprire i collegamenti esterni in
una scheda nuova senza dare accesso alla dashboard.

#### Scenario: Script in un file
- **WHEN** un `proposal.md` contiene `<script>alert(1)</script>` e `<img src=x onerror=alert(1)>`
- **THEN** la dashboard mostra quei caratteri come testo e nessuno script parte

#### Scenario: Collegamento javascript
- **WHEN** un file contiene `[clic](javascript:alert(1))`
- **THEN** il collegamento non è attivo

### Requirement: Committenti e token dalla dashboard
La dashboard MUST permettere di creare un committente e di rigenerarne il token, e MUST mostrare il
token una sola volta, subito dopo la creazione o la rigenerazione, con l'invito a copiarlo.

#### Scenario: Nuovo committente
- **WHEN** si crea il committente `CVSTUDIO`
- **THEN** la dashboard mostra il token una volta e, dopo aver chiuso la finestra, non lo mostra più

### Requirement: Progetti e idee dalla dashboard
La dashboard MUST permettere di creare un progetto sotto un committente e un'idea sotto un progetto o
un cantiere, con nome, descrizione e file caricati dal browser, e di modificare un'idea finché è in
stato `idea`.

#### Scenario: Idea con file
- **WHEN** in `poker` si crea l'idea `iDOC converter` trascinando 10 file `.md`
- **THEN** compare `idoc-converter` in stato `idea` con i suoi 10 file

#### Scenario: Modifica di un file di un'idea
- **WHEN** sul file `appunti.md` di un'idea si preme "Modifica", si cambia il testo e si preme "Salva le modifiche"
- **THEN** il file sul server ha il testo nuovo e la dashboard lo mostra formattato; se il salvataggio non riesce il testo scritto resta nel campo

#### Scenario: Editor Markdown
- **WHEN** si preme "Modifica" su `appunti.md` di un'idea
- **THEN** si apre un editor con la barra (grassetto, corsivo, titolo, elenchi, task, citazione, codice, collegamento, anteprima e anteprima affiancata) e l'anteprima formatta il testo come il documento mostrato
- **AND** la pagina non carica niente da altri siti: script, stili e icone dell'editor arrivano dal server

#### Scenario: Bozza non salvata
- **WHEN** mentre si modifica `appunti.md` si apre un altro cantiere e poi si torna all'idea, oppure si chiude la pagina
- **THEN** tornando, `appunti.md` è ancora in modifica con il testo scritto; chiudendo, il browser chiede conferma
- **AND** se intanto l'idea è stata abbandonata o presa, o `appunti.md` è stato tolto, la bozza si scarta e il browser non chiede più conferma

### Requirement: Esiti dalla dashboard
La dashboard MUST permettere di sospendere, riattivare e abbandonare un cantiere, ciascuno dopo una
conferma che nomina il cantiere. MUST non permettere di segnarlo completato.

#### Scenario: Abbandono confermato
- **WHEN** si sceglie "abbandona" su `vecchio-parser` e si conferma
- **THEN** il cantiere diventa `abbandonato` e la dashboard dice che alla prossima sessione Claude proporrà di archiviarlo

#### Scenario: Annullato
- **WHEN** si sceglie "sospendi" e poi "annulla" nella conferma
- **THEN** il cantiere non cambia

### Requirement: Navigazione a livelli
La colonna di sinistra MUST mostrare un livello alla volta (committenti, progetti di un committente, cantieri di un progetto) con un comando per tornare al livello sopra. Al livello dei cantieri MUST filtrare per aperti, idee e chiusi con i conteggi del progetto. La colonna e la scheda tecnica MUST potersi chiudere e riaprire, e il loro stato MUST restare al ricaricamento. Sopra il titolo del centro MUST esserci il percorso della scelta (committente, progetto, padri del cantiere, cantiere), con un segmento cliccabile per ognuno tranne l'ultimo.

#### Scenario: Risalire dal cantiere
- **WHEN** è scelto `PRIV / cantiere / navigazione-dashboard` e si clicca il segmento `cantiere` del percorso
- **THEN** il centro mostra il progetto `cantiere` e la colonna, aperta, i suoi cantieri

#### Scenario: Colonna che si chiude da sola
- **WHEN** si sceglie un cantiere nella colonna
- **THEN** il cantiere si apre al centro e la colonna diventa la rotaia «sfoglia»

#### Scenario: Tornare su
- **WHEN** la colonna mostra i cantieri di `mercurius` e si clicca «‹ PRIV»
- **THEN** la colonna mostra i progetti di `PRIV`, senza cambiare quello che c'è al centro

### Requirement: Scelta nell'indirizzo
La scelta corrente MUST stare nell'indirizzo della pagina (`#/committente/progetto/padre/cantiere`). Una scelta nuova MUST aggiungere un passo alla cronologia del browser; Indietro e Avanti MUST riportare alle scelte di quei passi. Aprendo la pagina, l'indirizzo MUST vincere sulla scelta ricordata dal browser. Un indirizzo che non porta a niente MUST lasciare la scelta corrente e tornare il suo indirizzo.

#### Scenario: Indietro
- **WHEN** si sceglie il progetto `mercurius`, poi `AI-Berkshire`, poi il committente `PRIV`, e si preme tre volte Indietro
- **THEN** la pagina mostra `AI-Berkshire`, poi `mercurius`, poi la scelta di partenza

#### Scenario: Link
- **WHEN** si apre `#/PRIV/parity-deriva/multi-instrument-simulations/basket-mix` con un'altra scelta ricordata
- **THEN** la pagina mostra `basket-mix` con il suo percorso

### Requirement: Telefono
A 720 px o meno la dashboard MUST mostrare una schermata alla volta: la colonna aperta prende tutto lo schermo e nasconde il centro, chiusa è una barra in cima con «sfoglia». La scheda tecnica MUST aprirsi come un foglio dal basso sopra un velo, con la pagina sotto inerte, e MUST chiudersi con il suo bottone, con un tocco sul velo o con Esc (salvo un dialogo aperto sopra). All'apertura, e stringendo la finestra sotto quella soglia, la colonna e la scheda MUST essere chiuse; quello che si apre al telefono MUST NOT cambiare lo stato ricordato per il desktop, che torna allargando la finestra.

#### Scenario: Dal cantiere a un'idea
- **WHEN** a 390×844 si tocca «sfoglia», poi «‹ PRIV», `mercurius`, «Idee» e un'idea
- **THEN** ogni tocco mostra un livello a tutto schermo, e l'idea si apre al centro con la colonna chiusa

#### Scenario: Foglio della scheda
- **WHEN** a 390×844 si apre la scheda tecnica dalla testata
- **THEN** la scheda sale dal basso sopra un velo, il fuoco va al suo bottone di chiusura e resta nel foglio; un tocco sul velo la chiude e il fuoco torna al bottone della testata

### Requirement: Pallino delle domande in attesa
La dashboard MUST mostrare un pallino rosso sul cantiere con almeno una domanda in attesa, e sul progetto e sui cantieri padre che lo contengono, con il numero se sono più di una. Nell'indice MUST mostrarlo anche sul filtro (aperti, idee, chiusi) che contiene il cantiere, contando solo le domande proprie dei suoi cantieri. Il pallino MUST avere un'alternativa testuale per gli screen reader e MUST sparire quando le domande si chiudono, al successivo aggiornamento della vista.

#### Scenario: Una domanda in un cantiere figlio
- **WHEN** `nis2/criteri` ha una domanda in attesa
- **THEN** il pallino compare su `nis2/criteri`, su `nis2` e sul progetto

#### Scenario: Più domande
- **WHEN** un progetto ha tre domande in attesa in cantieri diversi
- **THEN** il pallino del progetto mostra `3`

#### Scenario: Domanda in un altro filtro
- **WHEN** un cantiere completato ha una domanda in attesa e nell'indice è scelto il filtro degli aperti
- **THEN** il pallino compare sul filtro dei chiusi

#### Scenario: Domanda chiusa
- **WHEN** la domanda si chiude
- **THEN** al prossimo aggiornamento il pallino non c'è più

### Requirement: Riquadro delle domande in attesa
La scheda di un cantiere con domande in attesa MUST mostrare in alto il riquadro "In attesa di risposta" con, per ogni domanda, il testo, le opzioni, la sessione, la macchina e da quanto tempo aspetta. Il riquadro MUST dire che la risposta si dà dal terminale, finché i comandi dalla dashboard non la permettono.

#### Scenario: Domanda a scelta
- **WHEN** il cantiere ha una domanda con due opzioni, in attesa da 5 minuti
- **THEN** il riquadro mostra il testo, le due opzioni, la sessione, la macchina e `da 5 minuti`

#### Scenario: Nessuna domanda
- **WHEN** il cantiere non ha domande in attesa
- **THEN** il riquadro non compare

### Requirement: Domande del lavoro senza cantiere
La pagina di un progetto MUST mostrare in alto il riquadro "In attesa di risposta" con le domande delle sue sessioni senza cantiere, e il pallino sulla riga di quelle sessioni in "Attività non censite". Nell'indice, al livello dei cantieri, il pallino di queste domande MUST stare sul titolo del progetto.

#### Scenario: Lavoro diretto sul progetto
- **WHEN** una sessione senza cantiere aspetta una risposta
- **THEN** la pagina del progetto mostra la domanda nel riquadro e il pallino sulla riga della sessione, e nell'indice il pallino sta sul titolo del progetto

### Requirement: Task e rami
La pagina di un cantiere MUST avere una scheda «Task e rami» con i task del suo `tasks.md` e, accanto a ciascuno, i cantieri nati da quel task con stato e avanzamento; in testa MUST dire da quale cantiere è nato e quali rami ha, e MUST permettere di mettere e togliere un «nato da». Un ramo senza task MUST stare in testa, non accanto a un task.

#### Scenario: Ramo accanto al suo task
- **WHEN** si apre `multi-instrument-simulations` e `basket-mix` è nato dal suo task 1.1
- **THEN** accanto al task 1.1 c'è `basket-mix` con il suo stato e 7/8, e un clic lo apre

#### Scenario: Nato da messo e tolto dalla scheda
- **WHEN** in «Task e rami» di `b` si sceglie `a`, si scrive il task `2.1` e si preme «Lega», poi si preme la × accanto ad `a`
- **THEN** prima `a` compare in «nato da» con «dal task 2.1», poi sparisce

### Requirement: Binari nel tempo
La pagina di un committente MUST avere una scheda «Binari»: un asse dei giorni e, per ogni cantiere non idea, una linea dalla nascita (o dalla presa, per un'idea presa più tardi) all'ultimo aggiornamento, poi a puntini fino a oggi o alla chiusura. Un cantiere aperto fermo da 3 giorni o più MUST dire da quanti giorni. Le ore MUST essere quelle locali del browser.

#### Scenario: Cantiere fermo
- **WHEN** un cantiere aperto ha l'ultimo aggiornamento di 9 giorni fa
- **THEN** la sua linea è gialla fino a quel giorno, poi a puntini fino a oggi con «fermo 9 g»

### Requirement: Rami nei binari
Nei binari un ramo MUST stare sotto il cantiere da cui è nato e partire dalla sua linea nel momento in cui è nato. Un ramo verso un altro progetto MUST restare un moncone con il nome, e il progetto che lo riceve MUST contarlo nella sua testata.

#### Scenario: Ramo nello stesso progetto
- **WHEN** `basket-mix` è nato da `multi-instrument-simulations` il 20 ottobre
- **THEN** la riga di `basket-mix` sta sotto quella di `multi-instrument-simulations` e la sua linea parte dal 20 ottobre con un tratto verticale dalla linea del padre

### Requirement: Binari al telefono
A 720 px o meno la scheda «Binari» MUST mostrare il quadro ad albero: una riga per cantiere con rientro per i rami, stato, task, sessioni e ultimo aggiornamento.

#### Scenario: Telefono
- **WHEN** si apre «Binari» a 390×844
- **THEN** si vede il quadro ad albero, senza scorrimento orizzontale

### Requirement: Lingua della dashboard
La dashboard MUST essere disponibile in italiano e in inglese. L'interfaccia (etichette, pulsanti,
dialoghi, messaggi, date ed età relative) MUST seguire la lingua scelta, e l'attributo `lang` della
pagina MUST corrispondere. I dati degli utenti (nomi, note, idee, resoconti, file dei change) MUST
restare nella lingua in cui sono scritti. Una chiave senza traduzione MUST ricadere sull'italiano.

#### Scenario: Prima visita con browser in inglese
- **WHEN** si apre la dashboard senza una scelta salvata e il browser preferisce l'inglese
- **THEN** l'interfaccia è in inglese e `<html lang>` vale `en`

#### Scenario: Prima visita con altra lingua
- **WHEN** si apre la dashboard senza una scelta salvata e il browser preferisce il francese
- **THEN** l'interfaccia è in italiano

#### Scenario: Cambio lingua
- **WHEN** l'utente sceglie "English" dal selettore
- **THEN** l'interfaccia passa all'inglese subito, senza ricaricare, e dopo un ricaricamento resta in inglese

#### Scenario: Dati non tradotti
- **WHEN** la dashboard è in inglese e un cantiere ha un resoconto scritto in italiano
- **THEN** il resoconto compare com'è, in italiano

#### Scenario: Date ed età
- **WHEN** la dashboard è in inglese e un turno è di ieri
- **THEN** compare "yesterday" e non "ieri"; un'età di tre ore compare "3 h ago"
