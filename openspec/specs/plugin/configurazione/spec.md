# plugin/configurazione Specification

## Purpose
Porta il plugin forgia da installato a funzionante con un solo setup: URL e token verificati,
configurazione salvata a livello utente, server MCP registrato in Claude Code, e da lì tracciamento
sempre attivo finché l'utente non lo spegne.

## Requirements

### Requirement: Setup verificato prima di salvare
`forgia setup --url <url> [--token-stdin]` MUST accettare solo URL `https`, o `http` solo per localhost,
togliere lo slash finale e chiamare `GET /api/v1/salute` con il token. Se la risposta non è 200 con
`versione_contratto: 1` MUST dare un errore chiaro e non salvare nulla. Senza `--token-stdin` e con un
terminale interattivo MUST chiedere il token senza mostrarlo.

#### Scenario: Token sbagliato
- **WHEN** il setup riceve un token che il server rifiuta con 401
- **THEN** il comando dice che il token non è valido, esce con errore e non scrive la configurazione

#### Scenario: URL in chiaro verso un host remoto
- **WHEN** l'URL è `http://forgia.example.org`
- **THEN** il setup lo rifiuta e chiede `https`

#### Scenario: Server di versione diversa
- **WHEN** `salute` risponde con `versione_contratto: 2`
- **THEN** il setup si ferma con un errore che nomina la versione attesa

### Requirement: Configurazione utente protetta
Il setup riuscito MUST scrivere la configurazione in `$XDG_CONFIG_HOME/forgia/config.json` (default
`~/.config/forgia/`, su Windows `%APPDATA%\forgia\config.json`) con permessi 0600 e i campi `url`, `token`,
`abilitato: true`, `nome_server_mcp` (default `forgia`), `modalita_resoconto` (null = quella del server),
`mcp_registrato_il`.

#### Scenario: Permessi
- **WHEN** il setup finisce su Linux
- **THEN** `~/.config/forgia/config.json` ha permessi 0600

### Requirement: Registrazione del server MCP
Il setup MUST registrare il server MCP a livello utente con nome `nome_server_mcp`, transport HTTP,
URL `<url>/mcp` e header `Authorization: Bearer <token>`, sostituendo una registrazione precedente con lo
stesso nome. Il token MUST passare solo dallo script, mai da un comando scritto da Claude. Dopo una
registrazione riuscita MUST salvare `mcp_registrato_il`.

#### Scenario: Registrazione già presente
- **WHEN** esiste già un server MCP `forgia` a livello utente
- **THEN** il setup lo sostituisce con il nuovo URL e token e salva `mcp_registrato_il`

### Requirement: Registrazione a mano senza Claude Code nel PATH
Se il comando `claude` non si trova, il setup MUST stampare la configurazione MCP da aggiungere a mano,
senza il token in chiaro, e salvare comunque la configurazione. `mcp_registrato_il` MUST restare null.

#### Scenario: Claude Code non nel PATH
- **WHEN** il comando `claude` non si trova
- **THEN** il setup stampa il JSON da aggiungere a mano con un segnaposto al posto del token, salva la configurazione e lascia `mcp_registrato_il` a null

### Requirement: Permesso per i tool MCP su richiesta
Il setup MUST proporre di aggiungere `mcp__<nome_server_mcp>` ai permessi consentiti in
`~/.claude/settings.json` con `/cantiere permessi`, senza farlo da solo. Solo `forgia permetti-mcp` (che
`/cantiere permessi` lancia) MUST unire la regola al JSON esistente, dopo averne fatto un backup, senza
mai sovrascrivere le altre impostazioni.

#### Scenario: Utente accetta
- **WHEN** l'utente lancia `/cantiere permessi` e `settings.json` ha già altre regole
- **THEN** il file contiene le regole di prima più `mcp__forgia`, e accanto c'è il backup

#### Scenario: Utente non lo chiede
- **WHEN** il setup finisce e l'utente non lancia `/cantiere permessi`
- **THEN** `settings.json` resta identico

### Requirement: Override da ambiente
`FORGIA_URL` e `FORGIA_TOKEN` MUST avere la precedenza sui valori della configurazione. `FORGIA_TOKEN`
MUST bastare al setup.

#### Scenario: Token da ambiente
- **WHEN** `FORGIA_TOKEN` è impostata e l'utente lancia `/cantiere server <url>` per il primo setup
- **THEN** il setup usa quel token e non lo chiede

### Requirement: Tracciamento sempre attivo finché spento
Dopo il setup il tracciamento MUST valere in ogni sessione e in ogni progetto. `forgia off` MUST spegnerlo e
`forgia on` riaccenderlo, in modo persistente.

#### Scenario: Nuovo progetto
- **WHEN** il setup è fatto e l'utente apre Claude Code in un altro progetto
- **THEN** gli hook inviano eventi anche lì senza altre azioni

#### Scenario: Spento
- **WHEN** l'utente lancia `forgia off`
- **THEN** nessun hook invia eventi finché non lancia `forgia on`

### Requirement: Stato della configurazione
`forgia status [--json]` MUST mostrare configurazione con token mascherato, se il tracciamento è acceso,
raggiungibilità del server e ultima sessione vista per la cwd. Con `--json` MUST dire anche se il plugin è
configurato.

#### Scenario: Token mascherato
- **WHEN** l'utente lancia `forgia status`
- **THEN** il token compare solo con le ultime 4 cifre

### Requirement: Avviso se non configurato
Se il plugin non è configurato, l'avvio della sessione MUST non iniettare contesto e MUST al massimo mostrare
all'utente, una volta al giorno, `cantiere forgia non configurato: lancia /cantiere`.

#### Scenario: Due avvii nello stesso giorno
- **WHEN** il plugin non è configurato e l'utente apre due sessioni nello stesso giorno
- **THEN** l'avviso compare solo nella prima e Claude non riceve contesto
