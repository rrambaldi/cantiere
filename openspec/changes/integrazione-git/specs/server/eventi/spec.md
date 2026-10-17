# Spec Delta

## MODIFIED Requirements

### Requirement: Validazione stretta dell'evento
Il server MUST accettare solo corpi conformi al Contratto v2: campi `evento_id` (uuid4), `ts` (ISO 8601
UTC), `tipo`, `session_id`, `host`, `cwd`, `repo` (stringa o null), `branch` (stringa o null),
`progetto`, `dati`. `tipo` MUST essere uno di `session_start`, `prompt`, `todo`, `stop`, `session_end`,
`apri_cantiere`, `commit`, `issue`, e `dati` MUST rispettare la forma del suo tipo. Ogni campo di testo MUST avere una
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

#### Scenario: Commit con hash non valido
- **WHEN** arriva un evento `commit` con un hash che non è esadecimale di 40 caratteri
- **THEN** il server risponde 422 e non registra nulla

#### Scenario: Issue con stato sconosciuto
- **WHEN** arriva un evento `issue` con stato `sospesa`
- **THEN** il server risponde 422

## ADDED Requirements

### Requirement: Forma degli eventi commit e issue
L'evento `commit` MUST portare una lista di commit, ciascuno con `hash`, `ts`, `file`, `aggiunte`, `tolte`, `issue` (numeri) e, facoltativi, `titolo` e `corpo`. L'evento `issue` MUST portare `repo`, `numero`, `titolo` e `stato`. Entrambi MUST essere idempotenti su `evento_id`.

#### Scenario: Lista di commit
- **WHEN** arriva un evento `commit` con tre commit
- **THEN** il server li registra tutti e risponde 200 con la forma consueta

#### Scenario: Evento ripetuto
- **WHEN** lo stesso `evento_id` di un `commit` arriva due volte
- **THEN** il secondo non registra nulla e risponde 200
