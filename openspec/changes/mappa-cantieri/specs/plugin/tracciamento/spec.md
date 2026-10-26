## ADDED Requirements

### Requirement: Subagenti contati
Il plugin MUST mandare un evento per ogni chiamata del tool `Agent`, con il solo tipo del subagente. MUST NOT mandare il prompt, la descrizione o il risultato. Il server MUST contare i subagenti per sessione e mostrarli con la sessione nel cantiere.

#### Scenario: Tre subagenti
- **WHEN** una sessione nel cantiere lancia due subagenti `Explore` e uno `general-purpose`
- **THEN** la sessione nel cantiere mostra 3 subagenti (2 Explore, 1 general-purpose) e nel database non c'è testo dei prompt
