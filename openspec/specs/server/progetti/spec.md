# server/progetti Specification

## Purpose
Tiene i progetti (i prodotti: poker, mercurius, Logiquo) sotto il loro committente, e raccoglie il
lavoro fatto direttamente su un progetto senza un cantiere, come attività non censite.

## Requirements

### Requirement: Progetto sotto un committente
Ogni progetto MUST appartenere a un solo committente e avere un nome unico dentro quel committente,
confrontato sullo slug. Il nome MUST essere conservato come scritto. Un progetto MUST non avere stato
né esito.

#### Scenario: Stesso nome in committenti diversi
- **WHEN** `PRIV` ha il progetto `monitor` e si crea `monitor` sotto `DGT`
- **THEN** la creazione riesce e i due progetti sono distinti

#### Scenario: Nome già usato nel committente
- **WHEN** `CVSTUDIO` ha il progetto `poker` e si prova a creare `Poker` sotto `CVSTUDIO`
- **THEN** la creazione è rifiutata con un errore che nomina `poker`

### Requirement: Creazione esplicita
Un progetto MUST nascere solo da una richiesta di creazione esplicita, dalla dashboard o da
`POST /api/v1/progetti` con il token del committente. Un evento o un tool che nomina un progetto
inesistente MUST non crearlo.

#### Scenario: Creazione via API
- **WHEN** il token di `CVSTUDIO` chiama `POST /api/v1/progetti` con `{"nome": "poker"}`
- **THEN** il server crea `poker` sotto `CVSTUDIO` e risponde con il progetto creato

#### Scenario: Evento su un progetto inesistente
- **WHEN** arriva un evento con `progetto: "pokr"` e `pokr` non esiste nel committente
- **THEN** il server risponde 422 con un errore che dice che il progetto non esiste, e non crea nulla

### Requirement: Elenco dei progetti
`GET /api/v1/progetti` MUST restituire i progetti del committente del token, ciascuno con nome, slug,
data di creazione e numero di cantieri per stato.

#### Scenario: Elenco
- **WHEN** il token di `PRIV` chiama `GET /api/v1/progetti` e `PRIV` ha `cantiere` e `mercurius`
- **THEN** riceve i due progetti con i conteggi dei loro cantieri

### Requirement: Lavoro diretto sul progetto
Una sessione legata a un progetto ma a nessun cantiere MUST essere considerata lavoro diretto sul
progetto. Il progetto MUST elencarla tra le attività non censite con titolo della sessione, host,
avvio, ultimo evento, turni, stato della sessione e ultimo resoconto di `aggiorna_stato` (ora,
fatto, prossimo e blocco), oppure nessun resoconto.

#### Scenario: Sessione senza cantiere
- **WHEN** una sessione su `poker` lavora senza scegliere un cantiere e manda il titolo `fix login mobile`
- **THEN** `poker` mostra tra le attività non censite `fix login mobile` con host, avvio, ultimo evento e turni

#### Scenario: Ultimo resoconto di una sessione senza cantiere
- **WHEN** la sessione `fix login mobile` su `poker` chiama due volte `aggiorna_stato` e poi riceve un prompt
- **THEN** l'attività non censita ha stato `lavorando` e come ultimo resoconto il secondo, con ora, fatto, prossimo e blocco

#### Scenario: Sessione che entra in un cantiere
- **WHEN** una sessione elencata tra le attività non censite di `poker` entra nel cantiere `pdfconverter`
- **THEN** non compare più tra le attività non censite e compare tra le sessioni di `pdfconverter`
