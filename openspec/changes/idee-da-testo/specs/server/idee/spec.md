## ADDED Requirements

### Requirement: Appunti scritti nella dashboard
La dashboard MUST permettere di scrivere il testo di un file dell'idea in un campo, con un nome a scelta, senza prepararlo come file sul computer. Il testo MUST essere salvato come file `.md` dell'idea e MUST seguire le stesse regole degli altri file (dimensione, numero, solo in stato `idea`).

#### Scenario: Testo in creazione
- **WHEN** creando un'idea si scrive un testo e si sceglie il nome `contesto`
- **THEN** l'idea nasce con il file `contesto.md` che contiene il testo

#### Scenario: Testo su idea esistente
- **WHEN** su un'idea in stato `idea` si scrive un testo con nome `note.md`
- **THEN** il file `note.md` è aggiunto o sostituito, e `/cantiere prendi` lo consegna con gli altri
