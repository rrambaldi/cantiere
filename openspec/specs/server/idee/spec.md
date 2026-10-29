# server/idee Specification

## Purpose
Dà una casa al lavoro prima che cominci: un cantiere in stato `idea`, con i suoi file di appunti,
creato dalla dashboard e preso in lavorazione da Claude Code, che ne fa un change OpenSpec.

## Requirements

### Requirement: Idea come cantiere in stato idea
Un'idea MUST essere un cantiere in stato `idea`, sotto un progetto o sotto un altro cantiere, con
nome, descrizione facoltativa e zero o più file. Il suo nome di change MUST essere riservato e
controllato come per gli altri cantieri. Un'idea MUST non avere sessioni.

#### Scenario: Idea sotto un progetto
- **WHEN** dalla dashboard si crea in `poker` l'idea `iDOC converter` con 10 file `.md`
- **THEN** nasce il cantiere `poker/idoc-converter` in stato `idea` con i 10 file

#### Scenario: Idea sotto un cantiere
- **WHEN** dalla dashboard si crea l'idea `preprod` sotto il cantiere `idoc-converter`
- **THEN** nasce `poker/idoc-converter/preprod` in stato `idea`, con change riservato `idoc-converter-preprod`

### Requirement: File delle idee
I file di un'idea MUST essere `.md` o `.txt` in UTF-8, ciascuno sotto `max_file` byte, al massimo
`max_file_idea` per idea, con nomi senza barre né `..`. Un file non conforme MUST essere rifiutato
con un errore che lo nomina, senza toccare gli altri.

#### Scenario: File binario
- **WHEN** si allega a un'idea il file `schema.pdf`
- **THEN** il file è rifiutato con un errore che dice che sono ammessi solo `.md` e `.txt`

#### Scenario: File troppo grande
- **WHEN** si allega un `.md` più grande di `max_file`
- **THEN** il file è rifiutato e l'idea resta com'era

### Requirement: Modifica solo in stato idea
Nome, descrizione e file MUST essere modificabili solo finché il cantiere è in stato `idea`. Dopo la
presa in lavorazione i file sul server MUST essere solo la copia mandata dal plugin.

#### Scenario: File aggiunto dopo la presa
- **WHEN** il cantiere `idoc-converter` è `aperto` e la dashboard prova ad aggiungergli un file
- **THEN** la richiesta è rifiutata con 409 e un errore che dice che il cantiere è già in lavorazione

### Requirement: Presa in lavorazione
`POST /api/v1/progetti/<progetto>/cantieri/<percorso>/prendi` con un `session_id` MUST portare
un'idea ad `aperto`, associare la sessione al cantiere con origine `utente` e restituire il nome del
change con i file dell'idea. Per un cantiere già `aperto` MUST associare la sessione e restituire
gli stessi dati.

#### Scenario: Prima presa
- **WHEN** una sessione in `poker` prende `idoc-converter`, che è in stato `idea` con 10 file
- **THEN** il cantiere diventa `aperto`, la sessione è associata con origine `utente` e la risposta ha `change: "idoc-converter"` e i 10 file

#### Scenario: Seconda macchina
- **WHEN** `idoc-converter` è già `aperto` e una sessione su un'altra macchina lo prende
- **THEN** la sessione è associata al cantiere e riceve lo stesso change e gli stessi file

#### Scenario: Cantiere chiuso
- **WHEN** una sessione prova a prendere un cantiere `completato` o `abbandonato`
- **THEN** il server risponde 409 con un errore che nomina lo stato del cantiere

### Requirement: Idee nelle letture
Le letture dei cantieri MUST includere le idee con il loro stato, la data di creazione e il numero
di file, così che Claude possa proporle all'avvio della sessione.

#### Scenario: Idee in attesa
- **WHEN** `poker` ha le idee `idoc-converter` e `report-mensile`
- **THEN** l'elenco dei cantieri di `poker` le riporta in stato `idea` con il numero dei loro file

### Requirement: Appunti scritti nella dashboard
La dashboard MUST permettere di scrivere il testo di un file dell'idea in un campo, con un nome a scelta, senza prepararlo come file sul computer. Il testo MUST essere salvato come file `.md` dell'idea e MUST seguire le stesse regole degli altri file (dimensione, numero, solo in stato `idea`).

#### Scenario: Testo in creazione
- **WHEN** creando un'idea si scrive un testo e si sceglie il nome `contesto`
- **THEN** l'idea nasce con il file `contesto.md` che contiene il testo

#### Scenario: Testo su idea esistente
- **WHEN** su un'idea in stato `idea` si scrive un testo con nome `note.md`
- **THEN** il file `note.md` è aggiunto o sostituito, e `/cantiere prendi` lo consegna con gli altri
