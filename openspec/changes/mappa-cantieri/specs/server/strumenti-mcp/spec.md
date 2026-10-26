## ADDED Requirements

### Requirement: Rami da apri_cantiere
Il tool `apri_cantiere` MUST accettare `task`, `nato_da` e `nato_da_progetto`, con le stesse regole dell'evento REST. La descrizione MUST dire che il legame con il cantiere in cui sta la sessione si registra da solo, che `task` è il numero del task di partenza in `tasks.md` e che un secondo ramo dallo stesso cantiere vuole `nato_da`. Il testo del risultato MUST nominare il cantiere da cui il nuovo è nato, quando c'è.

#### Scenario: Conferma con il ramo
- **WHEN** la sessione sta in `a`, scelto dall'utente, e chiama `apri_cantiere` con origine `utente`, nome `b` e task `2.1`
- **THEN** il testo del risultato dice che `b` è nato da `a` (task 2.1)

#### Scenario: Regola nel contesto
- **WHEN** una sessione parte dentro un cantiere, con il resoconto non spento
- **THEN** le regole del contesto di avvio dicono che, quando l'utente fa partire da un task un'attività a sé, `apri_cantiere` con origine `utente` e `task` registra il legame se la sessione ci passa, e `/cantiere dirama` la fa partire senza lasciare il cantiere
