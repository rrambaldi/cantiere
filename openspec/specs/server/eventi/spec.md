# server/eventi Specification

## Purpose
Riceve gli eventi deterministici mandati dagli hook del plugin su `POST /api/v1/eventi`, li
registra in modo idempotente e aggiorna lo stato delle sessioni e dei loro todo, come fissato dal
Contratto v1.

## Requirements

### Requirement: Validazione stretta dell'evento
Il server MUST accettare solo corpi conformi al Contratto v1: campi `evento_id` (uuid4), `ts` (ISO 8601
UTC), `tipo`, `session_id`, `host`, `cwd`, `repo` (stringa o null), `branch` (stringa o null), `dati`.
`tipo` MUST essere uno dei sette previsti e `dati` MUST rispettare la forma del suo tipo. Ogni campo
di testo MUST avere una lunghezza massima. Ogni violazione MUST dare 422.

#### Scenario: Tipo sconosciuto
- **WHEN** arriva un evento con `tipo: "compila"`
- **THEN** il server risponde 422 e non salva nulla

#### Scenario: Dati non conformi al tipo
- **WHEN** arriva `chiudi_cantiere` con `esito: "finito"`
- **THEN** il server risponde 422

#### Scenario: Testo troppo lungo
- **WHEN** un todo ha un testo oltre la lunghezza massima
- **THEN** il server risponde 422

### Requirement: Forma della risposta
Ogni evento accettato MUST ricevere 200 con `cantiere` (oggetto `id`, `nome`, `origine`, `confermato`,
oppure null), `contesto` (stringa o null) e `config` (`modalita_resoconto`, `soglia_strumenti` presi
dalla configurazione del server). `origine` MUST dire chi ha associato questa sessione al cantiere.

#### Scenario: Risposta a un session_start
- **WHEN** arriva un `session_start` valido
- **THEN** la risposta ha `cantiere`, `contesto` e `config` con `modalita_resoconto` e `soglia_strumenti`

### Requirement: Idempotenza su evento_id
Lo stesso `evento_id` ricevuto più volte MUST produrre un solo evento salvato e la stessa identica
risposta della prima volta, senza riapplicare effetti.

#### Scenario: Reinvio dalla coda locale
- **WHEN** un `prompt` con un dato `evento_id` arriva due volte
- **THEN** in archivio c'è un solo evento, i turni della sessione crescono di uno e le due risposte sono uguali

### Requirement: Sessione creata al volo
Un evento con un `session_id` mai visto MUST creare la sessione, qualunque sia il tipo, con
host, cwd, repo e branch dell'evento, legata al cliente del token.

#### Scenario: Primo evento è un todo
- **WHEN** il primo evento di una sessione è un `todo`
- **THEN** la sessione viene creata, riceve un cantiere secondo le regole e il todo viene applicato

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
Il server MUST usare solo questi codici di errore su `/api/v1/eventi`: 401 token, 409 (corpo `{"errore": "..."}`)
per `apri_cantiere` rifiutato per precedenza, padre diverso o ciclo e per `chiudi_cantiere` di un padre con
figli aperti senza `forza`, 413 corpo troppo grande, 422 validazione o tipo
sconosciuto, 429 rate limit.

#### Scenario: Corpo non JSON
- **WHEN** il corpo non è JSON valido
- **THEN** il server risponde 422
