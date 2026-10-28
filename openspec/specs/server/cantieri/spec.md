# server/cantieri Specification

## Purpose
Fissa come ogni sessione finisce in un cantiere: assegnazione automatica di un cantiere
provvisorio, correzione da parte di Claude o dell'utente con una precedenza chiara, apertura per
nome condivisa tra macchine e chiusura con esito.

## Requirements

### Requirement: Apertura per slug condivisa
`apri_cantiere` MUST far entrare la sessione nel cantiere `aperto` del suo progetto indicato dal
percorso, da qualunque macchina; se il cantiere non esiste MUST crearlo `aperto`, con il suo nome di
change. Un percorso che indica un'idea MUST essere rifiutato con un errore che dice di prenderla.

#### Scenario: Due macchine sullo stesso cantiere
- **WHEN** una sessione sul portatile ha aperto `PDF converter` in `poker` e una sessione sul fisso, sempre in `poker`, apre `pdf-converter`
- **THEN** le due sessioni condividono lo stesso cantiere

#### Scenario: Nome nuovo
- **WHEN** arriva `apri_cantiere` con un percorso che non indica nessun cantiere del progetto
- **THEN** il server crea il cantiere `aperto` con quel nome, la descrizione data, l'origine dell'evento e il suo nome di change

#### Scenario: Percorso che indica un'idea
- **WHEN** arriva `apri_cantiere` su `idoc-converter`, che è in stato `idea`
- **THEN** il server rifiuta con 409 e l'errore dice di usare `/cantiere prendi idoc-converter`

### Requirement: Padre dal percorso e dal campo padre
`apri_cantiere` MUST leggere il percorso completo come `padre` seguito da `nome`, con i segmenti separati
da `/`, confrontati sullo slug e letti dal primo livello del progetto. L'ultimo segmento MUST essere il
cantiere a cui si associa la sessione, e ogni segmento MUST essere figlio del precedente.

#### Scenario: Nome a percorso
- **WHEN** arriva `apri_cantiere` con `nome: "idoc-converter/prototipo"` e il progetto non ha quei cantieri
- **THEN** il server crea `idoc-converter` e `prototipo` figlio di `idoc-converter`, e associa la sessione a `prototipo`

#### Scenario: Campo padre
- **WHEN** arriva `apri_cantiere` con `nome: "prototipo"` e `padre: "idoc-converter"`
- **THEN** il risultato è lo stesso del nome a percorso `idoc-converter/prototipo`

#### Scenario: Figlio cercato per nome
- **WHEN** `prototipo` esiste solo come figlio di `idoc-converter` e arriva `apri_cantiere` con `nome: "prototipo"` senza padre
- **THEN** il server crea un nuovo `prototipo` al primo livello del progetto

#### Scenario: Segmento vuoto
- **WHEN** arriva `apri_cantiere` con `nome: "idoc-converter//prototipo"`
- **THEN** il server risponde 422

### Requirement: Antenati creati al volo
Ogni antenato del percorso che non esiste MUST essere creato `aperto`, con l'origine dell'evento e il
suo nome di change. Solo l'ultimo segmento MUST essere associato alla sessione. Un antenato in stato
`idea` MUST passare ad `aperto`.

#### Scenario: Cantiere esistente senza padre
- **WHEN** `bozza` esiste al primo livello del progetto e arriva `apri_cantiere` con `nome: "report/bozza"`
- **THEN** nasce un `bozza` distinto sotto `report`, creato se non c'era, e il `bozza` di primo livello non cambia padre

#### Scenario: Padre nuovo
- **WHEN** arriva `apri_cantiere` con `nome: "report/bozza"` e `report` non esiste
- **THEN** nascono `report` (change `report`) e `report/bozza` (change `report-bozza`), entrambi `aperto`

### Requirement: Cantieri dentro un progetto
Ogni cantiere MUST appartenere a un solo progetto e avere al più un padre, che è un cantiere dello
stesso progetto. Il nome MUST essere unico tra i fratelli, confrontato sullo slug. Un cantiere
esistente MUST non cambiare padre né progetto.

#### Scenario: Stesso nome sotto padri diversi
- **WHEN** `poker` ha `idoc-converter/preprod` e si crea `export-pdf/preprod`
- **THEN** la creazione riesce e i due `preprod` sono cantieri distinti

#### Scenario: Stesso nome tra fratelli
- **WHEN** `idoc-converter` ha il figlio `preprod` e si prova a creare un altro `Preprod` sotto `idoc-converter`
- **THEN** non nasce un secondo cantiere: il nome indica quello esistente

### Requirement: Stati del cantiere
Un cantiere MUST essere in uno di questi stati: `idea`, `aperto`, `sospeso`, `completato`,
`abbandonato`. Le sole transizioni ammesse MUST essere: `idea` → `aperto` (presa in lavorazione),
`aperto` ↔ `sospeso`, `aperto` o `sospeso` → `completato` (dal repo), qualunque stato non finale →
`abbandonato`.

#### Scenario: Completato non si riapre
- **WHEN** un cantiere è `completato` e arriva una richiesta di riattivarlo
- **THEN** la richiesta è rifiutata con 409 e il cantiere resta `completato`

### Requirement: Sessione senza cantiere come lavoro diretto
Una sessione MUST essere legata al progetto indicato dai suoi eventi. Finché non entra in un cantiere,
MUST essere lavoro diretto sul progetto. Nessun cantiere MUST nascere da solo per una sessione.

#### Scenario: Prima sessione in un progetto
- **WHEN** arriva il primo `session_start` di una sessione con `progetto: "poker"`
- **THEN** la sessione è legata a `poker`, non ha cantiere e nessun cantiere viene creato

### Requirement: Esiti decisi dalla dashboard
Sospendere MUST portare un cantiere da `aperto` a `sospeso`, riattivare da `sospeso` ad `aperto`,
abbandonare da `idea`, `aperto` o `sospeso` ad `abbandonato`. Ogni esito MUST valere per tutte le
sessioni del cantiere e restare nello storico con la sua data.

#### Scenario: Sospeso e riattivato
- **WHEN** la dashboard sospende `export-pdf` e poi lo riattiva
- **THEN** il cantiere torna `aperto` e lo storico ha le due date

### Requirement: Abbandono di un padre
Abbandonare un cantiere con discendenti non finali MUST abbandonare anche loro, nella stessa
operazione. La conferma richiesta dalla dashboard MUST elencarli.

#### Scenario: Padre con fasi aperte
- **WHEN** si abbandona `idoc-converter`, che ha `prototipo` completato e `preprod` aperto
- **THEN** `idoc-converter` e `preprod` diventano `abbandonato` e `prototipo` resta `completato`

### Requirement: Sessioni di un cantiere non più aperto
Quando un cantiere smette di essere `aperto`, le sue sessioni MUST tornare a lavoro diretto sul
progetto al loro evento successivo. Entrare in un cantiere `sospeso` MUST essere rifiutato con un
errore che dice di riattivarlo dalla dashboard.

#### Scenario: Cantiere sospeso durante una sessione
- **WHEN** la dashboard sospende `export-pdf` mentre una sessione ci lavora, e poi arriva un `prompt` di quella sessione
- **THEN** la sessione è in lavoro diretto su `poker`

#### Scenario: Apertura di un sospeso
- **WHEN** Claude chiama `apri_cantiere` su `export-pdf`, che è `sospeso`
- **THEN** la richiesta è rifiutata e il motivo dice di riattivarlo dalla dashboard

### Requirement: Abbandonato da archiviare
Un cantiere `abbandonato` il cui change compare ancora tra gli attivi nell'ultima copia MUST risultare
da archiviare nelle letture, finché la copia non lo mostra archiviato o sparito.

#### Scenario: Abbandono dalla dashboard
- **WHEN** la dashboard abbandona `vecchio-parser` e la copia di `poker` ha ancora `vecchio-parser` tra gli attivi
- **THEN** le letture mostrano `vecchio-parser` abbandonato e da archiviare

### Requirement: Percorso nella risposta
Ogni cantiere restituito da eventi, tool e letture MUST riportare nel campo `percorso` la catena dei
nomi dal cantiere di primo livello del progetto, separati da `/`, insieme al progetto.

#### Scenario: Percorso di una fase
- **WHEN** la sessione è associata a `preprod`, figlio di `idoc-converter` nel progetto `poker`
- **THEN** la risposta ha `cantiere.nome: "preprod"`, `cantiere.percorso: "idoc-converter/preprod"` e `progetto: "poker"`

### Requirement: Precedenza tra utente e Claude
L'associazione sessione → cantiere MUST seguire la precedenza `utente` > `claude`. Una sessione
associata dall'utente MUST cambiare cantiere solo con un altro `apri_cantiere` di origine `utente`.
Un `apri_cantiere` di origine `claude` su una sessione associata dall'utente MUST essere rifiutato senza
effetti.

#### Scenario: Claude prova a cambiare il cantiere scelto dall'utente
- **WHEN** la sessione è stata associata a `pdfconverter` con origine `utente` e arriva `apri_cantiere` con origine `claude` e nome `refactoring-db`
- **THEN** il server rifiuta con 409 e `{"errore": "..."}` e la sessione resta in `pdfconverter`

#### Scenario: L'utente cambia idea
- **WHEN** la sessione è associata dall'utente e arriva un altro `apri_cantiere` con origine `utente`
- **THEN** la sessione passa al nuovo cantiere

#### Scenario: Claude sceglie per il lavoro diretto
- **WHEN** la sessione è in lavoro diretto sul progetto e arriva `apri_cantiere` con origine `claude`
- **THEN** la sessione passa al cantiere indicato con origine `claude`

### Requirement: Legame alla nascita
Il server MUST registrare da quale cantiere è nato un cantiere, separato dal padre, senza cambiare percorso e change. Quando `apri_cantiere` crea un cantiere e la sessione stava in un altro cantiere che non ne è un antenato, il server MUST registrare il legame da quel cantiere al nuovo, con il `task` se c'è. Entrare in un cantiere che esiste già MUST NOT creare legami.

#### Scenario: Ramo nato da un task
- **WHEN** la sessione s1 sta in `multi-instrument-simulations` e chiama `apri_cantiere` con nome `basket-mix` e task `1.1`
- **THEN** nasce il cantiere `basket-mix`, con change `basket-mix`, e la sua lettura ha `nato_da` con `multi-instrument-simulations` e task `1.1`

#### Scenario: Fase, non ramo
- **WHEN** la sessione s1 sta in `idoc-converter` e apre `idoc-converter/prototipo`
- **THEN** `prototipo` ha il padre `idoc-converter` e `nato_da` vuoto

#### Scenario: Cambiare lavoro non è un ramo
- **WHEN** la sessione s1 sta in `a` ed entra nel cantiere `c`, che esiste già
- **THEN** `c` non ha legami

#### Scenario: Tra progetti
- **WHEN** la sessione s1 sta in `app/a` e chiama `apri_cantiere` con nome `x` e progetto `web` dello stesso committente
- **THEN** `web/x` ha `nato_da` con progetto `app` e percorso `a`

### Requirement: Legame dichiarato
Con `nato_da` (e `nato_da_progetto` per un altro progetto dello stesso committente) il server MUST registrare il legame anche verso un cantiere che esiste già. Un cantiere di partenza che non esiste MUST dare un rifiuto 409 che lo nomina. Lo stesso legame MUST restare uno solo.

#### Scenario: Partenza che non c'è
- **WHEN** `apri_cantiere` arriva con `nato_da` `non-esiste`
- **THEN** la risposta è 409 e dice che il cantiere di partenza `non-esiste` non esiste, e nessun cantiere nasce

#### Scenario: Dichiarato due volte
- **WHEN** due `apri_cantiere` con `nato_da` `a` arrivano per lo stesso cantiere `b`
- **THEN** `b` ha un solo legame da `a`

### Requirement: Legami impossibili
Un `task` senza un legame scritto (né `nato_da`, né una sessione in un cantiere che ne apre uno nuovo, o con una partenza che è un antenato o un discendente) MUST dare 409 senza creare nulla. Tra un cantiere e un suo antenato o discendente MUST NOT nascere legami: basta il padre. Un legame dichiarato che chiuderebbe un giro di legami registrati MUST essere rifiutato.

#### Scenario: Task senza partenza
- **WHEN** una sessione in lavoro diretto chiama `apri_cantiere` con nome `nuovo` e task `1.1`, senza `nato_da`
- **THEN** la risposta è 409 e `nuovo` non nasce

#### Scenario: Giro
- **WHEN** `b` è nato da `a` e arriva `apri_cantiere` per `a` con `nato_da` `b`
- **THEN** la richiesta è rifiutata e `a` resta senza legami

#### Scenario: Secondo ramo dallo stesso cantiere
- **WHEN** la sessione sta in `a`, apre `b` (che nasce da `a`) e poi apre `c` con `nato_da` `a`
- **THEN** `b` e `c` sono tutti e due nati da `a`

### Requirement: Rami nella lettura
Ogni cantiere restituito da `GET /api/v1/cantieri`, da `elenca_cantieri` e dall'albero della dashboard MUST avere `nato_da`: l'elenco dei cantieri da cui è nato, ciascuno con `id`, `progetto`, `percorso`, `task` (o `null`) e `tipo` (`registrato` o `citato`). Un cantiere senza legami MUST avere `nato_da` vuoto.

#### Scenario: Lettura con il task
- **WHEN** si leggono i cantieri del progetto dopo lo scenario «Ramo nato da un task»
- **THEN** `basket-mix` ha `nato_da` `[{ id, progetto: "app", percorso: "multi-instrument-simulations", task: "1.1", tipo: "registrato" }]`

### Requirement: Legami citati
A ogni copia dei change di un progetto il server MUST ricavare i legami citati: un `proposal.md` o un `tasks.md` che nomina tra apici inversi il change di un altro cantiere dello stesso progetto lega i due cantieri dal più vecchio (per la data `created` del change, poi per quando il server l'ha visto) al più nuovo, con il numero del task se la citazione sta nel `tasks.md` del più vecchio, anche in una riga che continua il task. Tra un cantiere e un suo antenato MUST NOT nascere legami citati.

#### Scenario: Citato nel task
- **WHEN** il `tasks.md` di `multi-instrument-simulations` dice «- [ ] 1.1 … dipendono da `basket-mix`» e `basket-mix` è più recente
- **THEN** `basket-mix` ha `nato_da` con `multi-instrument-simulations`, task `1.1` e tipo `citato`

### Requirement: Citati sotto i registrati
Una citazione tolta dai file MUST togliere il suo legame citato alla copia dopo. Un legame registrato MUST vincere su uno citato della stessa coppia, anche al contrario, e MUST togliere i citati che con lui chiuderebbero un giro; un citato MUST NOT chiudere giri, anche passando da altri progetti.

#### Scenario: Registrato dopo citato
- **WHEN** un legame citato da `a` a `b` esiste e arriva `apri_cantiere` per `b` con `nato_da` `a` e task `2.1`
- **THEN** il legame diventa `registrato` con task `2.1` e resta così alla copia dopo

#### Scenario: Citazione tolta
- **WHEN** la proposta di un cantiere non cita più `altro`
- **THEN** alla copia dopo `altro` non ha più quel legame citato

### Requirement: Nato da dalla dashboard
La dashboard MUST poter mettere un legame `registrato` verso un cantiere da un altro dello stesso committente, con un task facoltativo che prende il posto di quello che c'era; MUST rifiutarlo con 409 e il motivo tra un cantiere e sé stesso o le sue fasi, o se chiude un giro. Un legame tolto dalla dashboard MUST sparire dalle letture, MUST NOT riportare indietro la sessione di un fork e MUST NOT tornare dalle citazioni; messo di nuovo, MUST tornare `registrato`.

#### Scenario: Legame messo dalla scheda
- **WHEN** dalla dashboard si mette su `b`, senza legami, «nato da» `a` con task `2.1`
- **THEN** `b` ha `nato_da` con `a`, task `2.1` e tipo `registrato`

#### Scenario: Citato tolto
- **WHEN** dalla dashboard si toglie da `b` il legame citato da `a`, e arriva una copia in cui il `tasks.md` di `a` cita ancora `b`
- **THEN** `b` resta senza `nato_da`

#### Scenario: Fase
- **WHEN** dalla dashboard si mette sulla fase `a/f` «nato da» `a`
- **THEN** la richiesta è rifiutata con 409 e il motivo

### Requirement: Fork da un task
`apri_cantiere` con `fork: true` MUST creare un cantiere nuovo nello stesso progetto, legato al cantiere della sessione con il task e con il ritorno, e spostarci la sessione. La conferma MUST nominare la partenza, il task con il suo testo e il change da scrivere; se il `tasks.md` copiato della partenza non ha quel task, MUST dirlo.

#### Scenario: Fork dal task 2.3
- **WHEN** la sessione s1 sta in `mappa-cantieri`, il cui `tasks.md` ha il task `2.3`, e manda `apri_cantiere` con nome `export-csv`, task `2.3` e `fork: true`
- **THEN** nasce `export-csv` con `nato_da` `mappa-cantieri` e task `2.3`, s1 è in `export-csv`, e il contesto dice di scrivere il change `export-csv` dal task 2.3

#### Scenario: Task che la copia non ha
- **WHEN** la sessione s1 sta in `mappa-cantieri` e manda il fork con task `9.9`, che non c'è nella copia del suo `tasks.md`
- **THEN** il fork nasce, e la conferma dice che il task 9.9 non c'è nella copia e di controllare il numero con l'utente

### Requirement: Rifiuti del fork
Il server MUST rifiutare un fork con 409, senza creare niente, se la sessione non sta in un cantiere aperto, se manca `task`, se il cantiere esiste già o se l'evento arriva più di 5 minuti dopo il suo `ts`.

#### Scenario: Fork arrivato tardi dalla coda
- **WHEN** l'evento del fork, con `ts` di 6 minuti fa, arriva al server dalla coda del plugin
- **THEN** il server risponde 409 con il motivo e non nasce nessun cantiere

#### Scenario: Senza cantiere
- **WHEN** la sessione s1 lavora direttamente sul progetto e manda un fork
- **THEN** il server risponde 409 con il motivo

### Requirement: Ritorno dal fork
Quando un cantiere F smette di essere aperto, ogni sessione ancora in F con un legame di ritorno verso F scritto con il suo `session_id` MUST tornare nel cantiere di partenza, se è aperto, con un avviso che nomina F, il suo stato, la partenza e il task. Le altre sessioni in F MUST passare al lavoro diretto come prima.

#### Scenario: Fork archiviato
- **WHEN** s1 è nel fork `export-csv` nato da `mappa-cantieri` task `2.3` e la copia dei change porta `export-csv` archiviato
- **THEN** `export-csv` è completato, s1 è in `mappa-cantieri` e il suo avviso dice di riprendere dal task 2.3

#### Scenario: Fork dentro un fork
- **WHEN** s1 apre il fork `g` da `f`, che è un fork di `p`, e `g` viene archiviato
- **THEN** s1 torna in `f`, non in `p`

#### Scenario: Partenza chiusa nel frattempo
- **WHEN** s1 è nel fork `f` di `p`, `p` è stato sospeso, e `f` viene archiviato
- **THEN** s1 passa al lavoro diretto sul progetto

#### Scenario: Un'altra sessione nel fork
- **WHEN** s2 è entrata nel fork `f` aperto da s1, e `f` viene archiviato
- **THEN** s2 passa al lavoro diretto; s1, se è ancora in `f`, torna alla partenza

### Requirement: Avviso nella risposta della copia
`PUT /api/v1/progetti/<p>/openspec` MUST accettare `?session_id=` nell'indirizzo. Se la copia sposta o chiude il cantiere di quella sessione, la risposta MUST portare l'avviso in `contesto` e il `cantiere` della sessione; l'avviso MUST restare anche per la risposta al prompt dopo. Senza `session_id` la risposta MUST restare quella di prima.

#### Scenario: Copia con il ritorno
- **WHEN** s1 manda la copia che archivia il suo fork `export-csv`
- **THEN** la risposta ha `contesto` con il ritorno a `mappa-cantieri` task 2.3 e `cantiere` `mappa-cantieri`, e la risposta al prompt dopo di s1 ha lo stesso avviso, quella dopo ancora no
