## ADDED Requirements

### Requirement: Diramazione da comando
`/cantiere dirama <progetto>/<nome> [--task N]` MUST creare un'idea nel progetto indicato, dello stesso committente, legata al cantiere della sessione con il task se c'è. Chi prende l'idea con `/cantiere prendi` MUST trovare il legame già scritto. Senza cantiere nella sessione il comando MUST rifiutare in una riga.

#### Scenario: Ramo in un altro progetto
- **WHEN** la sessione sta in `parity-deriva/analisi per identificare entrate` e l'utente scrive `/cantiere dirama mercurius/info-extra --task 3.2`
- **THEN** in `mercurius` nasce l'idea `info-extra`, con `nato_da` il cantiere della sessione e task `3.2`, e la risposta è una riga di conferma
