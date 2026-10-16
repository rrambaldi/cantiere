# Spec Delta

## ADDED Requirements

### Requirement: Progetto in ogni evento
Ogni evento MUST portare il campo `progetto`, il nome di un progetto del committente del token. Un
evento con un progetto diverso da quello della sessione MUST spostare la sessione sul nuovo progetto,
in lavoro diretto.

#### Scenario: Progetto mancante
- **WHEN** arriva un evento senza il campo `progetto`
- **THEN** il server risponde 422

#### Scenario: Sessione che cambia progetto
- **WHEN** la sessione è in `poker/pdfconverter` e arriva un suo `prompt` con `progetto: "admin"`
- **THEN** la sessione passa al progetto `admin` in lavoro diretto, senza cantiere

### Requirement: Titolo della sessione
`stop` e `session_end` MUST portare in `dati` il campo `titolo`, stringa o null. Il server MUST
conservare per la sessione l'ultimo titolo non null ricevuto e mostrarlo nelle letture.

#### Scenario: Titolo da rename
- **WHEN** arriva uno `stop` con `titolo: "fix login mobile"` e poi uno con `titolo: null`
- **THEN** la sessione mostra il titolo `fix login mobile`

## MODIFIED Requirements

### Requirement: Validazione stretta dell'evento
Il server MUST accettare solo corpi conformi al Contratto v2: campi `evento_id` (uuid4), `ts` (ISO 8601
UTC), `tipo`, `session_id`, `host`, `cwd`, `repo` (stringa o null), `branch` (stringa o null),
`progetto`, `dati`. `tipo` MUST essere uno di `session_start`, `prompt`, `todo`, `stop`, `session_end`,
`apri_cantiere`, e `dati` MUST rispettare la forma del suo tipo. Ogni campo di testo MUST avere una
lunghezza massima. Ogni violazione MUST dare 422.

#### Scenario: Tipo sconosciuto
- **WHEN** arriva un evento con `tipo: "compila"`
- **THEN** il server risponde 422 e non salva nulla

#### Scenario: Dati non conformi al tipo
- **WHEN** arriva `apri_cantiere` con `origine: "dashboard"`
- **THEN** il server risponde 422

#### Scenario: Testo troppo lungo
- **WHEN** un todo ha un testo oltre la lunghezza massima
- **THEN** il server risponde 422

#### Scenario: Chiusura da un client v1
- **WHEN** arriva un evento con `tipo: "chiudi_cantiere"`
- **THEN** il server risponde 422

### Requirement: Forma della risposta
Ogni evento accettato MUST ricevere 200 con `progetto` (il nome), `cantiere` (oggetto `id`, `nome`,
`percorso`, `origine`, `stato`, `change`, oppure null per il lavoro diretto), `contesto` (stringa o
null) e `config` (`modalita_resoconto`, `soglia_strumenti` presi dalla configurazione del server).
`origine` MUST dire chi ha associato questa sessione al cantiere.

#### Scenario: Risposta a un session_start
- **WHEN** arriva un `session_start` valido per una sessione nuova in `poker`
- **THEN** la risposta ha `progetto: "poker"`, `cantiere: null`, `contesto` e `config` con `modalita_resoconto` e `soglia_strumenti`

### Requirement: Sessione creata al volo
Un evento con un `session_id` mai visto MUST creare la sessione, qualunque sia il tipo, con
host, cwd, repo e branch dell'evento, legata al committente del token e al progetto dell'evento.

#### Scenario: Primo evento è un todo
- **WHEN** il primo evento di una sessione è un `todo` con `progetto: "poker"`
- **THEN** la sessione viene creata in lavoro diretto su `poker` e il todo viene applicato

### Requirement: Errori del contratto
Il server MUST usare solo questi codici di errore su `/api/v1/eventi`: 401 token, 409 (corpo
`{"errore": "..."}`) per `apri_cantiere` rifiutato per precedenza, per un cantiere `sospeso` o chiuso,
per un'idea o per un nome di change già preso, 413 corpo troppo grande, 422 validazione, tipo
sconosciuto o progetto inesistente, 429 rate limit.

#### Scenario: Corpo non JSON
- **WHEN** il corpo non è JSON valido
- **THEN** il server risponde 422

#### Scenario: Apertura di un'idea come evento
- **WHEN** arriva l'evento `apri_cantiere` su un cantiere in stato `idea`
- **THEN** il server risponde 409 con un errore che dice di prenderla
