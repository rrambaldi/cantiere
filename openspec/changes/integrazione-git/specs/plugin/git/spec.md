# Spec Delta

## Purpose

Fa arrivare al server i commit del lavoro in sessione e tiene i messaggi di commit nella forma voluta, con le issue del cantiere. Il token del forge resta sulla macchina.

## ADDED Requirements

### Requirement: Commit della sessione
Allo stop di un turno il plugin MUST mandare i commit fatti dalla sessione dopo l'ultimo già visto: hash, data, numero di file, righe aggiunte e tolte, issue citate. Senza nuovi commit non MUST mandare niente. Con `messaggi_commit` spento MUST NOT mandare né titolo né corpo.

#### Scenario: Commit nel turno
- **WHEN** nel turno Claude ha fatto due commit
- **THEN** lo stop manda un evento `commit` con i due, senza messaggio se l'opzione è spenta

#### Scenario: Nessun commit
- **WHEN** il turno finisce senza nuovi commit
- **THEN** il plugin non manda nessun evento `commit`

#### Scenario: Opzione accesa
- **WHEN** `messaggi_commit` è acceso nella configurazione ricevuta dal server
- **THEN** l'evento porta anche titolo e corpo di ogni commit

#### Scenario: Repo senza commit o git assente
- **WHEN** la cartella non è un repo, oppure git non è nel PATH
- **THEN** il plugin non manda niente e non dà errore (fail-open)

### Requirement: Regola del messaggio di commit
Il contesto MUST dire a Claude che ogni commit ha un titolo breve, una riga vuota e una spiegazione di una-tre righe sul perché, e che se il cantiere ha issue MUST finire con `Refs #N` per tutte, il piano per primo. Il contesto MUST dire che `Closes`, `Fixes` e `Resolves` non vanno scritti.

#### Scenario: Contesto con issue
- **WHEN** parte una sessione su un cantiere con le issue 40 (piano) e 42
- **THEN** il contesto riporta la regola e `Refs #40 #42`

#### Scenario: Cantiere senza issue
- **WHEN** il cantiere non ha issue
- **THEN** la regola chiede titolo e spiegazione, senza `Refs`

### Requirement: Controllo prima del commit
Un hook `PreToolUse` sui comandi `git commit` MUST controllare il messaggio: titolo non vuoto, riga vuota, almeno una riga di spiegazione e, se il cantiere ha issue, `Refs` con tutte. MUST rifiutare con un motivo che dice cosa manca, e MUST rifiutare ogni `Closes`, `Fixes` o `Resolves`. Se non riesce a leggere il messaggio (per esempio con `-F` o l'editor) MUST lasciar passare.

#### Scenario: Messaggio senza spiegazione
- **WHEN** Claude lancia `git commit -m "fix login"`
- **THEN** l'hook rifiuta e dice che manca la spiegazione

#### Scenario: Refs mancante
- **WHEN** il cantiere ha la issue 42 e il messaggio non cita `#42`
- **THEN** l'hook rifiuta e chiede `Refs #42`

#### Scenario: Closes
- **WHEN** il messaggio contiene `Closes #42`
- **THEN** l'hook rifiuta e chiede di usare `Refs`

#### Scenario: Messaggio a norma
- **WHEN** il messaggio ha titolo, riga vuota, spiegazione e `Refs #42`
- **THEN** l'hook lascia passare

#### Scenario: Messaggio illeggibile
- **WHEN** il commit usa `-F messaggio.txt`
- **THEN** l'hook lascia passare

#### Scenario: Sessione fuori dai cantieri
- **WHEN** la sessione non ha un'area configurata o il tracciamento è spento
- **THEN** l'hook non controlla nulla

### Requirement: Token solo sulla macchina
Il plugin MUST leggere il token del forge dalla variabile d'ambiente indicata nella configurazione del repo. MUST NOT mandare il token al server, scriverlo nei log, nella coda o nei file di sessione, né metterlo nel contesto. Senza la variabile il plugin MUST lavorare senza chiamare il forge.

#### Scenario: Variabile assente
- **WHEN** `FORGIA_GIT_TOKEN` non è impostata
- **THEN** il plugin manda commit e conteggi, non chiama il forge e non dà errore

#### Scenario: Debug acceso
- **WHEN** il log di debug è acceso e il plugin chiama il forge
- **THEN** il log non contiene il token né l'intestazione di autorizzazione

### Requirement: Titolo e stato delle issue dal forge
Con il token disponibile il plugin MUST leggere dal forge titolo e stato delle issue del cantiere e mandarli al server con eventi `issue`, al più una volta per issue e sessione ogni dieci minuti. Un errore del forge, un timeout o un 404 MUST NOT bloccare l'hook né perdere altri eventi.

#### Scenario: Issue esistente
- **WHEN** il cantiere ha la issue 42 e il forge risponde con titolo e stato
- **THEN** il plugin manda un evento `issue` con quei dati

#### Scenario: Issue inesistente
- **WHEN** il forge risponde 404 per la issue 99
- **THEN** il plugin non manda niente per la 99 e la sessione prosegue

#### Scenario: Forge irraggiungibile
- **WHEN** il forge non risponde entro il tempo massimo
- **THEN** l'hook termina senza errore e gli altri eventi partono
