## ADDED Requirements

### Requirement: Fork da un task
`apri_cantiere` con `fork: true` MUST creare un cantiere nuovo nello stesso progetto, legato al cantiere della sessione con il task e con il ritorno, e spostarci la sessione. MUST rifiutare con 409, senza creare niente, se la sessione non sta in un cantiere aperto, se manca `task`, se il cantiere esiste già, o se il `tasks.md` copiato della partenza non ha quel task. La conferma MUST nominare la partenza, il task con il suo testo e il change da scrivere.

#### Scenario: Fork dal task 2.3
- **WHEN** la sessione s1 sta in `mappa-cantieri`, il cui `tasks.md` ha il task `2.3`, e manda `apri_cantiere` con nome `export-csv`, task `2.3` e `fork: true`
- **THEN** nasce `export-csv` con `nato_da` `mappa-cantieri` e task `2.3`, s1 è in `export-csv`, e il contesto dice di scrivere il change `export-csv` dal task 2.3

#### Scenario: Task che non c'è
- **WHEN** la sessione s1 sta in `mappa-cantieri` e manda il fork con task `9.9`, che non c'è nel suo `tasks.md`
- **THEN** il server risponde 409 con il motivo e non nasce nessun cantiere

#### Scenario: Senza cantiere
- **WHEN** la sessione s1 lavora direttamente sul progetto e manda un fork
- **THEN** il server risponde 409 con il motivo

### Requirement: Ritorno dal fork
Quando un cantiere F smette di essere aperto, ogni sessione ancora in F con un legame di ritorno verso F scritto con il suo `session_id` MUST tornare nel cantiere di partenza, se è aperto, con un avviso che nomina F, il suo stato, la partenza e il task. Le altre sessioni in F MUST passare al lavoro diretto come prima.

#### Scenario: Fork archiviato
- **WHEN** s1 è nel fork `export-csv` nato da `mappa-cantieri` task `2.3` e la copia dei change porta `export-csv` archiviato
- **THEN** `export-csv` è completato, s1 è in `mappa-cantieri` e il suo avviso dice di riprendere dal task 2.3

#### Scenario: Fork dentro un fork
- **WHEN** s1 apre il fork `g` da `f`, che è un fork di `p`, e `g` viene archiviato
- **THEN** s1 torna in `f`, non in `p`

#### Scenario: Partenza chiusa nel frattempo
- **WHEN** s1 è nel fork `f` di `p`, `p` è stato sospeso, e `f` viene archiviato
- **THEN** s1 passa al lavoro diretto sul progetto

#### Scenario: Un'altra sessione nel fork
- **WHEN** s2 è entrata nel fork `f` aperto da s1, e `f` viene archiviato
- **THEN** s2 passa al lavoro diretto; s1, se è ancora in `f`, torna alla partenza

### Requirement: Avviso nella risposta della copia
`PUT /api/v1/progetti/<p>/openspec` MUST accettare `session_id`. Se la copia sposta o chiude il cantiere di quella sessione, la risposta MUST portare l'avviso in `contesto` e il `cantiere` della sessione, e l'avviso MUST NOT ripetersi al prompt dopo. Senza `session_id` la risposta MUST restare quella di prima.

#### Scenario: Copia con il ritorno
- **WHEN** s1 manda la copia che archivia il suo fork `export-csv`
- **THEN** la risposta ha `contesto` con il ritorno a `mappa-cantieri` task 2.3 e `cantiere` `mappa-cantieri`, e il prompt dopo di s1 non lo ripete
