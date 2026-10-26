# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Forma degli eventi domanda e risposta
L'evento `domanda` MUST portare `id` (stringa non vuota), `tipo` (`scelta` o `attesa`), `testo` e `opzioni` (lista di stringhe, anche vuota). L'evento `risposta` MUST portare l'`id` della domanda. Entrambi MUST essere idempotenti su `evento_id`.

#### Scenario: Domanda con opzioni
- **WHEN** arriva una `domanda` con tre opzioni
- **THEN** il server risponde 200 e le registra

#### Scenario: Troppe opzioni
- **WHEN** una `domanda` ha più di dieci opzioni
- **THEN** il server risponde 422
