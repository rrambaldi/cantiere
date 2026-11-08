# server/lettura Specification

## Purpose
Fa leggere a Claude i file di un cantiere del committente, in ogni stato, e trovarlo per parole,
senza prenderlo: lo stato non cambia e non nasce nessun change.

## Requirements

### Requirement: Elenco dei file di un cantiere
`GET /api/v1/progetti/<progetto>/cantieri/<percorso>/file` MUST restituire `{progetto, percorso, stato,
file}`, con ogni file come `{nome, origine, byte, aggiornato_il}`, senza contenuto, in ordine di nome. I
segmenti del percorso MUST essere confrontati come slug. I file dell'idea MUST chiamarsi `idee/<nome>`
con origine `idea`; quelli della copia del change MUST avere il loro percorso nel change e origine
`change`. Con lo stesso nome MUST valere il file del change. Con `?contenuto=1` ogni file MUST avere
anche `contenuto`, oppure `errore` con il motivo se non si legge (vedi i rifiuti), così tutto il
cantiere si legge in una richiesta.

#### Scenario: File di un'idea
- **WHEN** l'idea `Adonis` di `app` ha i file `Istruzioni.md` (24 byte) e `note.txt` (8 byte) e si chiama `GET /api/v1/progetti/app/cantieri/adonis/file`
- **THEN** la risposta ha `progetto: "app"`, `percorso: "Adonis"`, `stato: "idea"` e i file `idee/Istruzioni.md` e `idee/note.txt`, con origine `idea`, byte e `aggiornato_il`

#### Scenario: File del change
- **WHEN** la copia del change `parser` ha `proposal.md`, `specs/lettore/spec.md` e `idee/note.txt`
- **THEN** l'elenco di `parser` ha `idee/note.txt`, `proposal.md` e `specs/lettore/spec.md`, con origine `change`

#### Scenario: Lo stesso nome nell'idea e nel change
- **WHEN** `parser` ha anche il file dell'idea `note.txt` e la sua copia del change ha `idee/note.txt`
- **THEN** l'elenco ha un solo `idee/note.txt`, con origine `change`, e il suo contenuto è quello del change

#### Scenario: Tutto il cantiere in una richiesta
- **WHEN** si chiama `GET /api/v1/progetti/app/cantieri/adonis/file?contenuto=1` e `adonis` ha anche un file troppo grande e uno binario
- **THEN** ogni file ha `contenuto`, tranne quei due, che hanno `errore` con il motivo

### Requirement: Contenuto di un file
`GET /api/v1/progetti/<progetto>/cantieri/<percorso>/file?nome=<nome>`, con il nome nella query (un
proxy davanti al server decodifica le barre codificate nel percorso), MUST restituire `progetto`, `percorso` e `stato` del cantiere con `nome`,
`origine`, `byte`, `aggiornato_il` e `contenuto` del file. Il nome di un file dell'idea MUST valere
anche senza `idee/`.

#### Scenario: File dell'idea
- **WHEN** si chiede `nome=idee%2FIstruzioni.md` di `Adonis`
- **THEN** la risposta ha `contenuto: "# Istruzioni\nusa la coda"` e origine `idea`

#### Scenario: Nome senza idee/
- **WHEN** si chiede `note.txt` di `adonis`
- **THEN** la risposta ha il contenuto di `idee/note.txt`

#### Scenario: Barre nel nome
- **WHEN** si chiede `nome=specs%2Flettore%2Fspec.md` di `parser`
- **THEN** la risposta ha `contenuto: "## Requisiti"` e origine `change`

### Requirement: Rifiuti della lettura
Un file che non c'è MUST dare 404 con un errore che elenca i file del cantiere. Un cantiere o un
progetto che non esiste MUST dare 404. Un file più grande di `max_file` byte o binario (con un byte
NUL) MUST dare 422 con il motivo.

#### Scenario: File assente
- **WHEN** si chiede `x.md` di `adonis`
- **THEN** il server risponde 404 con `Il file "x.md" non c'è nel cantiere "Adonis". File: idee/Istruzioni.md, idee/note.txt.`

#### Scenario: File troppo grande
- **WHEN** `max_file` vale 1000 e si chiede `grande.md` di 1001 byte
- **THEN** il server risponde 422 con `Il file "idee/grande.md" supera 1000 byte: non si legge da qui.`

#### Scenario: File binario
- **WHEN** si chiede `binario.md`, che contiene un byte NUL
- **THEN** il server risponde 422 con `Il file "idee/binario.md" è binario: si leggono solo file di testo.`

### Requirement: Solo il committente del token
Lettura e ricerca MUST vedere solo i cantieri e i progetti del committente del token. Un cantiere o un
progetto di un altro committente MUST rispondere come uno che non esiste.

#### Scenario: Cantiere di un altro committente
- **WHEN** `PRIV` ha il cantiere `segreto` in `app` e il token di un altro committente, che ha anche lui un progetto `app`, ne chiede l'elenco dei file
- **THEN** il server risponde 404 con lo stesso errore di un cantiere inventato

#### Scenario: Ricerca di un altro committente
- **WHEN** il token di un altro committente cerca `adonis`
- **THEN** non trova nulla

### Requirement: Lettura senza presa
Leggere i file di un cantiere MUST NOT cambiarne lo stato e MUST NOT creare change o copie.

#### Scenario: Idea letta
- **WHEN** si leggono l'elenco e i file dell'idea `Adonis`
- **THEN** `Adonis` resta in stato `idea` e non ha nessuna copia di change

### Requirement: Ricerca per parole
`GET /api/v1/cerca?testo=<parole>[&progetto=<nome>]` MUST restituire `{cantieri}` con, per ognuno,
`progetto`, `percorso`, `stato`, `descrizione` e `file`. MUST trovare i cantieri del committente, in
ogni stato, che hanno tutte le parole nel percorso, nella descrizione o nei nomi dei file (quelli
dell'idea sotto `idee/` e quelli del change), senza badare a maiuscole e accenti. `file` MUST elencare
i file il cui nome ha almeno una delle parole. Con `progetto` MUST cercare solo in quel progetto. Un
testo vuoto MUST trovare tutti i cantieri, con tutti i loro file.

#### Scenario: Parole con maiuscole
- **WHEN** si cerca `istruzioni ADONIS`
- **THEN** si trova `{progetto: "app", percorso: "Adonis", stato: "idea", descrizione: "Già discusse con il cliente", file: ["idee/Istruzioni.md"]}`

#### Scenario: Testo vuoto
- **WHEN** si cerca con il testo vuoto
- **THEN** si trovano tutti i cantieri del committente, e `Adonis` ha `file: ["idee/Istruzioni.md", "idee/note.txt"]`

#### Scenario: Parole nella descrizione senza accenti
- **WHEN** si cerca `gia cliente`
- **THEN** si trova `Adonis`, che ha la descrizione `Già discusse con il cliente`

#### Scenario: Parola nel nome di un file del change
- **WHEN** si cerca `lettore`
- **THEN** si trova `parser` con `file: ["specs/lettore/spec.md"]`

#### Scenario: Filtro per progetto
- **WHEN** `parser` c'è in `app` e in `mercurius` e si cerca `parser` con `progetto=Mercurius`
- **THEN** si trova solo quello di `mercurius`

#### Scenario: Una parola che manca
- **WHEN** si cerca `adonis zebra`
- **THEN** non si trova nulla

### Requirement: Tool MCP di lettura
`cerca_cantieri(testo, progetto?)` MUST fare la stessa ricerca e restituire `ok: true` con `cantieri`.
`leggi_cantiere(percorso, file?, progetto?)` MUST restituire senza `file` l'elenco dei file e con `file`
il suo contenuto, anche come testo del risultato. Senza `progetto`, `leggi_cantiere` MUST cercare il
percorso in tutti i progetti del committente e, se lo trova in più di uno, rifiutare chiedendo il
progetto. Ogni rifiuto MUST essere un risultato non di errore con `ok: false` e il motivo.

#### Scenario: Ricerca e lettura
- **WHEN** Claude chiama `cerca_cantieri` con `istruzioni adonis`, poi `leggi_cantiere` con `adonis` e poi con `adonis` e `Istruzioni.md`
- **THEN** riceve `Adonis`, poi `ok: true` con `idee/Istruzioni.md` e `idee/note.txt`, poi `# Istruzioni\nusa la coda` nel testo e in `contenuto`; `Adonis` resta in stato `idea`

#### Scenario: Percorso in più progetti
- **WHEN** Claude chiama `leggi_cantiere` con `parser`, che c'è in `app` e in `mercurius`, senza progetto
- **THEN** riceve `ok: false` con `Il cantiere "parser" c'è in più progetti (app, mercurius): indica il progetto.`; con `progetto: "mercurius"` legge il file di `mercurius`

#### Scenario: Cantiere di un altro committente
- **WHEN** Claude chiama `leggi_cantiere` con `segreto`, che è di un altro committente
- **THEN** riceve `ok: false` con `Il cantiere "segreto" non esiste.`
