# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Precedenza tra origini
**Reason**: l'origine `auto` sparisce insieme ai cantieri provvisori.
**Migration**: requisito "Precedenza tra utente e Claude", con le stesse regole tra `utente` e `claude`.

### Requirement: Cantiere provvisorio agganciato a repo e branch
**Reason**: niente più cantieri provvisori: il progetto lo dice l'area della cartella, e il cantiere
lo sceglie l'utente al primo messaggio.
**Migration**: la sessione parte come lavoro diretto sul progetto (requisito "Sessione senza cantiere
come lavoro diretto").

### Requirement: Creazione del cantiere provvisorio
**Reason**: come sopra; un cantiere `<repo>@<branch>` non ha un change OpenSpec.
**Migration**: lavoro diretto sul progetto, elencato tra le attività non censite.

### Requirement: Chiusura per tutte le sessioni
**Reason**: completato lo decide il repo con `openspec archive`; sospeso e abbandonato li decide la
dashboard. `chiudi_cantiere` sparisce.
**Migration**: requisiti "Esiti decisi dalla dashboard" e "Sessioni di un cantiere non più aperto";
per il completato, la spec `server/openspec`.

### Requirement: Padre diverso o ciclo rifiutati
**Reason**: con nomi unici tra fratelli e percorsi letti dal primo livello, un percorso indica un solo
cantiere: non esiste più il cambio di padre, quindi neanche il ciclo.
**Migration**: nessuna; un percorso diverso indica un cantiere diverso.

### Requirement: Chiusura di un padre con figli aperti
**Reason**: la chiusura da Claude Code sparisce.
**Migration**: requisito "Abbandono di un padre"; il completamento del padre arriva dal repo.

### Requirement: Provvisori senza padre
**Reason**: i provvisori spariscono.
**Migration**: il campo `percorso` resta, nel requisito "Percorso nella risposta".
