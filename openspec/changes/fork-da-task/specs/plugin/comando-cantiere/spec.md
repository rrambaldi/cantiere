## ADDED Requirements

### Requirement: Fork da comando
`/cantiere fork <nome> --task <N> [— descrizione]` MUST mandare, in modo sincrono, `apri_cantiere` con origine `utente`, il task e `fork: true`, e passare a Claude la conferma o il motivo del rifiuto. Senza `--task` MUST NOT mandare niente e MUST rispondere con l'uso del comando. La copia dei change MUST portare il `session_id` della sessione e mettere il `contesto` della risposta nel contesto del prompt dopo, aggiornando il cantiere della sessione.

#### Scenario: Fork
- **WHEN** l'utente scrive `/cantiere fork export-csv --task 2.3 — esportazione dei binari`
- **THEN** il server riceve `apri_cantiere` con nome `export-csv`, descrizione `esportazione dei binari`, task `2.3` e `fork: true`, e Claude riceve la conferma

#### Scenario: Senza task
- **WHEN** l'utente scrive `/cantiere fork export-csv`
- **THEN** non parte nessun evento e Claude risponde con l'uso: `/cantiere fork <nome> --task <N>`

#### Scenario: Ritorno al prompt dopo
- **WHEN** alla fine del turno la copia archivia il fork e la risposta porta il ritorno a `mappa-cantieri`
- **THEN** al prompt dopo Claude riceve l'avviso del ritorno e il titolo della sessione torna su `mappa-cantieri`
