# Spec Delta

## Purpose

Tiene l'anagrafica dei committenti per cui si lavora (PRIV, DGT, CVSTUDIO...) e lega a ognuno il
token con cui i suoi client parlano al server, così che ogni committente veda e scriva solo i suoi
dati.

## ADDED Requirements

### Requirement: Committente come anagrafica fissa
Un committente MUST avere un nome unico senza distinzione tra maiuscole e minuscole, conservato
come scritto alla creazione, e una data di creazione. Un committente MUST non avere stato né esito:
non si apre, non si chiude e non si archivia.

#### Scenario: Stesso nome con maiuscole diverse
- **WHEN** esiste il committente `CVSTUDIO` e si prova a crearne uno di nome `cvstudio`
- **THEN** la creazione è rifiutata con un errore che nomina `CVSTUDIO`

#### Scenario: Nome conservato come scritto
- **WHEN** si crea il committente `PentaQo`
- **THEN** letture e dashboard lo mostrano come `PentaQo`

### Requirement: Nomi riservati
La creazione di un committente MUST rifiutare i nomi riservati alle rotte del server (`api`, `mcp`,
`ui`, senza distinzione di maiuscole), i nomi vuoti e quelli con caratteri diversi da lettere,
cifre, `-` e `_`.

#### Scenario: Nome riservato
- **WHEN** si prova a creare il committente `API`
- **THEN** la creazione è rifiutata con un errore che dice che il nome è riservato

#### Scenario: Nome con una barra
- **WHEN** si prova a creare il committente `PRIV/test`
- **THEN** la creazione è rifiutata e nessun committente nasce

### Requirement: Un token per committente
Ogni committente MUST avere esattamente un token attivo, creato insieme a lui e mostrato una sola
volta. Il server MUST salvarne solo l'hash. Il token MUST identificare il committente in ogni
richiesta REST e MCP.

#### Scenario: Creazione
- **WHEN** si crea il committente `DGT`
- **THEN** il token di `DGT` compare una volta sola e nel database c'è solo il suo hash

#### Scenario: Richiesta attribuita
- **WHEN** arriva una richiesta con il token di `DGT`
- **THEN** la richiesta è attribuita al committente `DGT`

### Requirement: Rigenerazione del token
Rigenerare il token di un committente MUST creare un token nuovo, mostrarlo una sola volta e
revocare il precedente con effetto immediato.

#### Scenario: Token vecchio dopo la rigenerazione
- **WHEN** si rigenera il token di `PRIV` e poi arriva una richiesta con il token precedente
- **THEN** il server risponde 401

### Requirement: Dati separati per committente
Ogni lettura e scrittura fatta con il token di un committente MUST riguardare solo i progetti, i
cantieri, le idee, le sessioni e i change di quel committente. Un riferimento a un oggetto di un
altro committente MUST essere trattato come inesistente.

#### Scenario: Elenco ristretto
- **WHEN** esistono cantieri aperti di `PRIV` e di `CVSTUDIO` e il token di `CVSTUDIO` chiede l'elenco dei cantieri
- **THEN** riceve solo i cantieri di `CVSTUDIO`

#### Scenario: Progetto di un altro committente
- **WHEN** il token di `DGT` manda un evento con `progetto: "poker"`, che esiste solo sotto `CVSTUDIO`
- **THEN** il server lo tratta come un progetto inesistente per `DGT` e non tocca i dati di `CVSTUDIO`

#### Scenario: Stesso nome di progetto in due committenti
- **WHEN** `PRIV` e `DGT` hanno entrambi un progetto `monitor`
- **THEN** ogni token vede e scrive solo il proprio `monitor`
