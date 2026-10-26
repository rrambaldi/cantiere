# server/eventi Specification

## Purpose
Riceve gli eventi deterministici mandati dagli hook del plugin su `POST /api/v1/eventi`, li
registra in modo idempotente e aggiorna lo stato delle sessioni e dei loro todo, come fissato dal
Contratto v1.

## Requirements

### Requirement: Validazione stretta dell'evento
Il server MUST accettare solo corpi conformi al Contratto v2: campi `evento_id` (uuid4), `ts` (ISO 8601
UTC), `tipo`, `session_id`, `host`, `cwd`, `repo` (stringa o null), `branch` (stringa o null),
`progetto`, `dati`. `tipo` MUST essere uno di `session_start`, `prompt`, `todo`, `stop`, `session_end`,
`apri_cantiere`, `domanda`, `risposta`, e `dati` MUST rispettare la forma del suo tipo. Ogni campo di testo MUST avere una
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

#### Scenario: Domanda con tipo sconosciuto
- **WHEN** arriva una `domanda` con tipo `urgente`
- **THEN** il server risponde 422 e non registra nulla

#### Scenario: Domanda senza identificativo
- **WHEN** arriva una `domanda` senza `id`
- **THEN** il server risponde 422

### Requirement: Forma della risposta
Ogni evento accettato MUST ricevere 200 con `progetto` (il nome), `cantiere` (oggetto `id`, `nome`,
`percorso`, `origine`, `stato`, `change`, oppure null per il lavoro diretto), `contesto` (stringa o
null) e `config` (`modalita_resoconto`, `soglia_strumenti` presi dalla configurazione del server).
`origine` MUST dire chi ha associato questa sessione al cantiere.

#### Scenario: Risposta a un session_start
- **WHEN** arriva un `session_start` valido per una sessione nuova in `poker`
- **THEN** la risposta ha `progetto: "poker"`, `cantiere: null`, `contesto` e `config` con `modalita_resoconto` e `soglia_strumenti`

### Requirement: Idempotenza su evento_id
Lo stesso `evento_id` ricevuto più volte MUST produrre un solo evento salvato e la stessa identica
risposta della prima volta, senza riapplicare effetti.

#### Scenario: Reinvio dalla coda locale
- **WHEN** un `prompt` con un dato `evento_id` arriva due volte
- **THEN** in archivio c'è un solo evento, i turni della sessione crescono di uno e le due risposte sono uguali

### Requirement: Sessione creata al volo
Un evento con un `session_id` mai visto MUST creare la sessione, qualunque sia il tipo, con
host, cwd, repo e branch dell'evento, legata al committente del token e al progetto dell'evento.

#### Scenario: Primo evento è un todo
- **WHEN** il primo evento di una sessione è un `todo` con `progetto: "poker"`
- **THEN** la sessione viene creata in lavoro diretto su `poker` e il todo viene applicato

### Requirement: Transizioni di stato della sessione
`session_start` MUST portare la sessione in `attiva`; `prompt` in `lavorando`, con un turno in più;
`stop` in `in_attesa`; `session_end` in `chiusa`. Un evento successivo a `session_end` MUST riaprire
la sessione secondo il suo tipo.

#### Scenario: Ciclo di un turno
- **WHEN** arrivano in ordine `session_start`, `prompt`, `stop`
- **THEN** la sessione passa da `attiva` a `lavorando` (turni = 1) a `in_attesa`

### Requirement: Eventi fuori ordine
Ogni evento MUST essere salvato. Transizioni di stato e snapshot dei todo MUST applicarsi solo se il
`ts` dell'evento è maggiore o uguale all'ultimo `ts` applicato per quella sessione.

#### Scenario: Stop arrivato dopo il prompt successivo
- **WHEN** arriva un `stop` con `ts` più vecchio dell'ultimo `prompt` già applicato
- **THEN** l'evento è salvato ma la sessione resta `lavorando`

### Requirement: Todo come snapshot o variazioni
Con `completo: true` la lista MUST sostituire per intero quella precedente della sessione. Con
`completo: false` ogni voce MUST applicarsi per `id`: inserita se nuova, aggiornata se esiste,
rimossa se `stato: "deleted"`. L'ordine dei todo MUST seguire l'ordine di arrivo.

#### Scenario: Snapshot completo
- **WHEN** la sessione ha 3 todo e arriva uno snapshot completo con 2 todo
- **THEN** la sessione ha esattamente quei 2 todo

#### Scenario: Variazione per id
- **WHEN** arriva `completo: false` con `{"id": "4", "stato": "completed"}` per un todo esistente
- **THEN** solo quel todo cambia stato

#### Scenario: Snapshot vecchio in ritardo
- **WHEN** arriva uno snapshot completo con `ts` più vecchio dell'ultimo applicato
- **THEN** l'evento è salvato e la lista dei todo non cambia

### Requirement: Registrazione dello stop
Il server MUST conservare per ogni `stop` i valori `strumenti_nel_turno`, `resoconto_inviato` e
`bloccato`, così da poter misurare quante volte la modalità forzata blocca un turno.

#### Scenario: Stop bloccato
- **WHEN** arriva uno `stop` con `bloccato: true`
- **THEN** l'evento salvato riporta `bloccato: true` ed è contabile per sessione e cliente

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

### Requirement: Forma degli eventi domanda e risposta
L'evento `domanda` MUST portare `id` (stringa non vuota), `tipo` (`scelta` o `attesa`), `testo` e `opzioni` (lista di stringhe, anche vuota). L'evento `risposta` MUST portare l'`id` della domanda. Entrambi MUST essere idempotenti su `evento_id`.

#### Scenario: Domanda con opzioni
- **WHEN** arriva una `domanda` con tre opzioni
- **THEN** il server risponde 200 e le registra

#### Scenario: Troppe opzioni
- **WHEN** una `domanda` ha più di dieci opzioni
- **THEN** il server risponde 422
