# Spec Delta

## MODIFIED Requirements

### Requirement: Bearer obbligatorio su REST e MCP
Ogni richiesta a `/api/v1/*` e a `/mcp` MUST portare `Authorization: Bearer <token>` con il token
attivo di un committente. Il server MUST rispondere 401 senza dettagli quando l'header manca, è
malformato, il token è sconosciuto o è stato sostituito da una rigenerazione. Il controllo MUST
essere lo stesso per REST e MCP. Le rotte della dashboard MUST non accettare il Bearer.

#### Scenario: Nessun token su REST
- **WHEN** arriva `POST /api/v1/eventi` senza header `Authorization`
- **THEN** il server risponde 401 e il corpo non dice perché

#### Scenario: Token revocato su MCP
- **WHEN** un client chiama un tool su `/mcp` con il token di un committente che nel frattempo è stato rigenerato
- **THEN** il server risponde 401 prima di eseguire il tool

#### Scenario: Token valido
- **WHEN** arriva una richiesta con il token attivo di un committente
- **THEN** la richiesta prosegue ed è attribuita a quel committente

### Requirement: Token conservati solo come hash
Il server MUST generare token casuali di almeno 32 byte, mostrarli una volta sola alla creazione o
alla rigenerazione e salvarne solo l'hash SHA-256. Il confronto MUST avvenire a tempo costante
sull'hash.

#### Scenario: Database senza token in chiaro
- **WHEN** si crea il committente `PRIV`
- **THEN** il suo token compare una volta sola e nel database c'è solo il suo hash

### Requirement: Verifica di salute
`GET /api/v1/salute` con un token valido MUST rispondere 200 con
`{"ok": true, "versione_contratto": 2, "cliente": "<nome del committente>"}`.

#### Scenario: Salute con token valido
- **WHEN** il token di `CVSTUDIO` chiama `GET /api/v1/salute`
- **THEN** riceve 200 con `ok: true`, `versione_contratto: 2` e `cliente: "CVSTUDIO"`

### Requirement: Limite sulla dimensione del corpo
Il server MUST rifiutare con 413, senza leggerlo tutto in memoria, ogni corpo più grande del suo
limite: `max_openspec` per la copia dei change, `max_file` per ogni file caricato dalla dashboard,
`max_body` (default 64 KB) per tutte le altre richieste.

#### Scenario: Corpo troppo grande
- **WHEN** arriva `POST /api/v1/eventi` con un corpo di 65 KB
- **THEN** il server risponde 413 e non salva nulla

#### Scenario: Copia dei change sopra 64 KB
- **WHEN** arriva una copia dei change di 300 KB e `max_openspec` vale 2 MB
- **THEN** il server la accetta

### Requirement: Rate limit per token
Il server MUST limitare ogni token a `rate_limit` richieste al minuto (default 120), sommando REST e
MCP, e rispondere 429 oltre il limite.

#### Scenario: Troppe richieste
- **WHEN** lo stesso token manda la richiesta numero 121 nello stesso minuto
- **THEN** il server risponde 429

#### Scenario: Token diversi non si sommano
- **WHEN** i token di due committenti mandano 100 richieste ciascuno nello stesso minuto
- **THEN** nessuna riceve 429

### Requirement: Log senza segreti né contenuti
I log applicativi MUST contenere solo tipo di richiesta o evento, session_id, committente ed esito. Non
MUST mai contenere token, header di autorizzazione o il contenuto dei campi di testo (todo, fatto,
prossimo, bloccato_da, nomi e descrizioni di cantieri e idee, note, titoli delle sessioni) né dei
file dei change e delle idee.

#### Scenario: Evento con todo
- **WHEN** arriva un evento `todo` con il testo "migrare la tabella clienti"
- **THEN** il log riporta tipo, session_id, committente ed esito, e il testo del todo non compare

#### Scenario: Copia dei change
- **WHEN** arriva la copia dei change di `poker`
- **THEN** il log riporta il tipo di richiesta, il committente e l'esito, e nessun contenuto dei file
