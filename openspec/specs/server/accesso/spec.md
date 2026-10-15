# server/accesso Specification

## Purpose
Decide chi può parlare con il server forgia e con quali limiti: token per cliente, controllo
Bearer su REST e MCP, rate limit, dimensione del corpo e log che non espongono segreti.

## Requirements

### Requirement: Bearer obbligatorio su REST e MCP
Ogni richiesta a `/api/v1/*` e a `/mcp` MUST portare `Authorization: Bearer <token>`. Il server MUST
rispondere 401 senza dettagli quando l'header manca, è malformato, il token è sconosciuto o il
cliente è revocato. Il controllo MUST essere lo stesso per REST e MCP.

#### Scenario: Nessun token su REST
- **WHEN** arriva `POST /api/v1/eventi` senza header `Authorization`
- **THEN** il server risponde 401 e il corpo non dice perché

#### Scenario: Token revocato su MCP
- **WHEN** un cliente revocato chiama un tool su `/mcp` con il suo vecchio token
- **THEN** il server risponde 401 prima di eseguire il tool

#### Scenario: Token valido
- **WHEN** arriva una richiesta con il token di un cliente attivo
- **THEN** la richiesta prosegue ed è attribuita a quel cliente

### Requirement: Token conservati solo come hash
Il server MUST generare token casuali di almeno 32 byte, mostrarli una volta sola alla creazione e
salvarne solo l'hash SHA-256. Il confronto MUST avvenire a tempo costante sull'hash.

#### Scenario: Database senza token in chiaro
- **WHEN** si crea un token per il cliente `portatile`
- **THEN** il token compare una volta sull'output del comando e nel database c'è solo il suo hash

### Requirement: Verifica di salute
`GET /api/v1/salute` con un token valido MUST rispondere 200 con
`{"ok": true, "versione_contratto": 1, "cliente": "<nome del cliente>"}`.

#### Scenario: Salute con token valido
- **WHEN** il cliente `portatile` chiama `GET /api/v1/salute`
- **THEN** riceve 200 con `ok: true`, `versione_contratto: 1` e `cliente: "portatile"`

### Requirement: Limite sulla dimensione del corpo
Il server MUST rifiutare con 413 ogni corpo più grande di `max_body` (default 64 KB), senza leggerlo
tutto in memoria.

#### Scenario: Corpo troppo grande
- **WHEN** arriva `POST /api/v1/eventi` con un corpo di 65 KB
- **THEN** il server risponde 413 e non salva nulla

### Requirement: Rate limit per token
Il server MUST limitare ogni token a `rate_limit` richieste al minuto (default 120), sommando REST e
MCP, e rispondere 429 oltre il limite.

#### Scenario: Troppe richieste
- **WHEN** lo stesso token manda la richiesta numero 121 nello stesso minuto
- **THEN** il server risponde 429

#### Scenario: Token diversi non si sommano
- **WHEN** due clienti mandano 100 richieste ciascuno nello stesso minuto
- **THEN** nessuna riceve 429

### Requirement: Log senza segreti né contenuti
I log applicativi MUST contenere solo tipo di richiesta o evento, session_id, cliente ed esito. Non
MUST mai contenere token, header di autorizzazione o il contenuto dei campi di testo (todo, fatto,
prossimo, bloccato_da, nomi e descrizioni dei cantieri, note).

#### Scenario: Evento con todo
- **WHEN** arriva un evento `todo` con il testo "migrare la tabella clienti"
- **THEN** il log riporta tipo, session_id, cliente ed esito, e il testo del todo non compare

### Requirement: Ascolto solo locale con host pubblico ammesso
Il server MUST ascoltare solo sull'indirizzo di `bind` (default `127.0.0.1:8765`) e lasciare il TLS al
reverse proxy. Il transport MCP MUST accettare l'host `public_host` dietro il proxy e MUST tenere
attiva la protezione dagli host non ammessi.

#### Scenario: Host pubblico configurato
- **WHEN** `public_host` è `forgia.example.org` e arriva una richiesta MCP con `Host: forgia.example.org`
- **THEN** la richiesta è accettata

#### Scenario: Host non ammesso
- **WHEN** arriva una richiesta MCP con `Host: altro.example.com`
- **THEN** il transport la rifiuta
