# Spec Delta

## ADDED Requirements

### Requirement: Git nella scheda del cantiere
La scheda di un cantiere MUST mostrare i suoi repo, le issue con il piano evidenziato e per prima, e i commit più recenti, con link al forge. Per i commit senza messaggio MUST mostrare hash abbreviato, data e conteggi.

#### Scenario: Cantiere con piano
- **WHEN** si apre un cantiere con il piano 40 e le issue 42 e 43
- **THEN** la scheda mostra `#40` con l'etichetta `piano`, poi `#42` e `#43`, ognuna con il suo link

#### Scenario: Commit senza messaggio
- **WHEN** il cantiere ha un commit registrato senza titolo
- **THEN** la scheda mostra l'hash abbreviato, la data e `3 file · +40 −5`

### Requirement: Modifica di repo e issue dalla dashboard
La dashboard MUST permettere di aggiungere e togliere repo e issue di un cantiere, di indicare il piano e il repo principale, e di cambiare forge, URL dell'API e nome della variabile del token. La modifica MUST arrivare alla sessione al prossimo prompt.

#### Scenario: Issue aggiunta dal web
- **WHEN** dalla scheda di `nis2` si aggiunge la issue 44
- **THEN** la scheda la mostra e la sessione in corso riceve il contesto aggiornato al prompt successivo

#### Scenario: Campo per il token
- **WHEN** si apre il modulo di configurazione git
- **THEN** il campo accetta solo il nome di una variabile e dice che il token va messo sulla macchina, non qui
