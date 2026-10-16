# server/openspec Specification

## Purpose
Lega ogni cantiere al suo change OpenSpec e tiene sul server una copia dei change mandata dal
plugin, così che dashboard e letture mostrino lo stato vero del lavoro, che resta nel repo.

## Requirements

### Requirement: Nome del change dal percorso
Il change di un cantiere MUST chiamarsi come il percorso del cantiere sotto il progetto, con gli slug
dei segmenti uniti da `-`. Lo slug MUST essere kebab-case: minuscole, cifre e trattini singoli.
Il nome del change MUST essere unico nel progetto.

#### Scenario: Cantiere annidato
- **WHEN** nel progetto `poker` si crea il cantiere `iDOC converter/Pre-prod`
- **THEN** il suo change si chiama `idoc-converter-pre-prod`

#### Scenario: Slug di un nome con punteggiatura
- **WHEN** nel progetto `mercurius` si crea il cantiere `tassi BCE,BoJ,SNB`
- **THEN** il suo change si chiama `tassi-bce-boj-snb`

#### Scenario: Nome di change già preso
- **WHEN** `poker` ha il cantiere `idoc-converter-preprod` al primo livello e si prova a creare `idoc-converter/preprod`
- **THEN** la creazione è rifiutata con 409 e un errore che nomina il cantiere che ha già quel change

### Requirement: Copia dei change dal plugin
`PUT /api/v1/progetti/<progetto>/openspec` MUST ricevere l'elenco dei change attivi del progetto, con
i loro file di testo, e dei change archiviati, con la data di archivio. Il server MUST conservare per
ogni change l'ultima copia ricevuta e rispondere con lo stato dei cantieri toccati.

#### Scenario: Prima copia
- **WHEN** il plugin manda la copia di `poker` con il change attivo `idoc-converter` e i file `proposal.md` e `idee/nota.md`
- **THEN** il server conserva i due file per il cantiere `idoc-converter` e risponde 200

#### Scenario: Stessa copia due volte
- **WHEN** arriva due volte la stessa copia
- **THEN** il secondo invio non cambia nulla e riceve la stessa risposta

### Requirement: File ammessi nella copia
La copia MUST contenere solo `.openspec.yaml`, `proposal.md`, `design.md`, `tasks.md`, i `.md` sotto
`specs/` e i `.md` e `.txt` sotto `idee/`, ciascuno sotto `max_file` byte. Un corpo oltre
`max_openspec` byte MUST dare 413; un percorso non ammesso, assoluto o con `..` MUST dare 422.

#### Scenario: Percorso fuori dal change
- **WHEN** la copia contiene il file `../../.env`
- **THEN** il server risponde 422 e non salva nulla della copia

#### Scenario: Copia troppo grande
- **WHEN** il corpo supera `max_openspec`
- **THEN** il server risponde 413

### Requirement: Copia più recente per change
Ogni change nella copia MUST portare l'istante dell'ultima modifica dei suoi file. Il server MUST
sostituire la copia di un change solo con una più recente. Un change archiviato MUST restare
archiviato anche se una copia successiva lo mostra attivo.

#### Scenario: Macchina con un checkout vecchio
- **WHEN** il server ha la copia di `export-pdf` modificata alle 10:00 e arriva da un'altra macchina una copia dello stesso change modificata alle 9:00
- **THEN** il server tiene la copia delle 10:00

#### Scenario: Archiviato poi visto attivo
- **WHEN** `export-pdf` risulta archiviato e arriva una copia che lo mostra tra gli attivi
- **THEN** il cantiere resta `completato` e la copia attiva è ignorata

### Requirement: Change senza cantiere
Un change attivo nella copia che non corrisponde a nessun cantiere del progetto MUST far nascere un
cantiere `aperto` al primo livello del progetto, con il nome del change e origine `repo`.

#### Scenario: Change creato da Claude Code
- **WHEN** la copia di `poker` contiene il change `export-pdf` e `poker` non ha un cantiere con quel change
- **THEN** nasce il cantiere `poker/export-pdf`, `aperto`, con origine `repo`

### Requirement: Completato dal repo
Un change che compare tra gli archiviati MUST portare il suo cantiere a `completato` con la data di
archivio, se il cantiere era `aperto` o `sospeso`. Un cantiere `abbandonato` MUST restare
`abbandonato`.

#### Scenario: Archivio dopo il lavoro
- **WHEN** il cantiere `export-pdf` è `aperto` e la copia mostra `2026-10-20-export-pdf` tra gli archiviati
- **THEN** il cantiere diventa `completato` con data 2026-10-20

#### Scenario: Archivio dopo un abbandono
- **WHEN** il cantiere `vecchio-parser` è `abbandonato` e la copia lo mostra archiviato
- **THEN** il cantiere resta `abbandonato` e smette di risultare da archiviare

### Requirement: Avanzamento del change
Per ogni cantiere con una copia, le letture MUST riportare quali artefatti esistono (proposal,
design, specs, tasks) e i task spuntati sul totale, contati dalle caselle `- [x]` e `- [ ]` di
`tasks.md`.

#### Scenario: Task a metà
- **WHEN** il `tasks.md` di `idoc-converter-prototipo` ha 7 caselle spuntate su 12
- **THEN** le letture riportano 7 task su 12 e gli artefatti presenti

### Requirement: Change quadro
Un cantiere con figli MUST riportare come avanzamento i figli `completato` sul totale dei figli non
`abbandonato`, oltre ai suoi task.

#### Scenario: Due fasi su tre
- **WHEN** `idoc-converter` ha i figli `prototipo` e `migrazione-preprod` completati e `preprod` aperto
- **THEN** le letture riportano per `idoc-converter` 2 fasi su 3

### Requirement: Change mancante
Un cantiere `aperto` il cui change non compare nell'ultima copia del progetto, né tra gli attivi né
tra gli archiviati, MUST risultare con il change mancante nelle letture, senza cambiare stato.

#### Scenario: Cantiere aperto da Claude prima del change
- **WHEN** Claude ha aperto `poker/report` e la copia successiva di `poker` non contiene `report`
- **THEN** le letture mostrano `report` aperto con il change mancante
