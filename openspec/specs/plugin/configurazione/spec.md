# plugin/configurazione Specification

## Purpose
Porta il plugin forgia da installato a funzionante con un solo setup: URL e token verificati,
configurazione salvata a livello utente, server MCP registrato in Claude Code, e da lì tracciamento
sempre attivo finché l'utente non lo spegne.

## Requirements

### Requirement: Setup verificato prima di salvare
`forgia collega` MUST accettare solo URL `https`, o `http` solo per localhost, togliere lo slash finale
e chiamare `GET /api/v1/salute` con il token. Se la risposta non è 200 con `versione_contratto: 2` MUST
dare un errore chiaro e non salvare nulla. Senza `--token-stdin` e con un terminale interattivo MUST
chiedere il token senza mostrarlo.

#### Scenario: Token sbagliato
- **WHEN** il collegamento riceve un token che il server rifiuta con 401
- **THEN** il comando dice che il token non è valido, esce con errore e non scrive la configurazione

#### Scenario: URL in chiaro verso un host remoto
- **WHEN** l'URL è `http://priv.progettazionisoftware.it/cantiere`
- **THEN** il collegamento lo rifiuta e chiede `https`

#### Scenario: Server di versione diversa
- **WHEN** `salute` risponde con `versione_contratto: 1`
- **THEN** il collegamento si ferma con un errore che nomina la versione attesa

### Requirement: Configurazione utente protetta
La configurazione MUST stare in `$XDG_CONFIG_HOME/forgia/config.json` (default `~/.config/forgia/`, su
Windows `%APPDATA%\forgia\config.json`) con permessi 0600, con i campi `abilitato`, `nome_server_mcp`
(default `forgia`), `modalita_resoconto` (null = quella del server) e `aree`: per ognuna `cartella`,
`url`, `token`, `committente`, `progetto`, `mcp_registrato_il`.

#### Scenario: Permessi
- **WHEN** il collegamento finisce su Linux
- **THEN** `~/.config/forgia/config.json` ha permessi 0600

#### Scenario: Stessa cartella collegata di nuovo
- **WHEN** `~/lavori/poker` è già un'area e si lancia di nuovo `forgia collega poker` con un altro token
- **THEN** la configurazione ha una sola area per `~/lavori/poker`, con il token nuovo

### Requirement: Registrazione del server MCP
Il collegamento MUST registrare il server MCP con nome `nome_server_mcp`, per la sola cartella
dell'area, transport HTTP, URL `<url>/mcp` e header `Authorization: Bearer <token>`, sostituendo una
registrazione precedente con lo stesso nome nella stessa cartella. Il token MUST passare solo dallo
script, mai da un comando scritto da Claude. Dopo una registrazione riuscita MUST salvare
`mcp_registrato_il` nell'area.

#### Scenario: Registrazione già presente
- **WHEN** esiste già un server MCP `forgia` per la cartella `~/lavori/poker`
- **THEN** il collegamento lo sostituisce con il nuovo URL e token e salva `mcp_registrato_il` nell'area

### Requirement: Registrazione a mano senza Claude Code nel PATH
Se il comando `claude` non si trova, il collegamento MUST stampare la configurazione MCP da aggiungere a
mano per quella cartella, senza il token in chiaro, e salvare comunque l'area. `mcp_registrato_il`
dell'area MUST restare null.

#### Scenario: Claude Code non nel PATH
- **WHEN** il comando `claude` non si trova
- **THEN** il collegamento stampa il JSON da aggiungere a mano con un segnaposto al posto del token, salva l'area e lascia il suo `mcp_registrato_il` a null

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
`FORGIA_TOKEN` e `FORGIA_URL` MUST bastare a `forgia collega` al posto di `--token-stdin` e `--url`.
Negli hook MUST valere sempre il token dell'area, mai `FORGIA_TOKEN`, così che i dati di un committente
non partano con il token di un altro.

#### Scenario: Token da ambiente
- **WHEN** `FORGIA_TOKEN` è impostata e l'utente lancia `/cantiere collega poker`
- **THEN** il collegamento usa quel token e non lo chiede

#### Scenario: Token da ambiente in un'altra area
- **WHEN** `FORGIA_TOKEN` contiene il token di `PRIV` e la sessione lavora in `~/lavori/poker`, collegata a `CVSTUDIO`
- **THEN** gli eventi partono con il token di `CVSTUDIO`

### Requirement: Tracciamento sempre attivo finché spento
Dopo il collegamento il tracciamento MUST valere in ogni sessione dentro un'area, e in nessuna fuori.
`forgia off` MUST spegnerlo e `forgia on` riaccenderlo, in modo persistente e per tutte le aree.

#### Scenario: Nuovo progetto
- **WHEN** l'utente apre Claude Code in una cartella che non sta in nessuna area
- **THEN** gli hook non inviano eventi finché la cartella non viene collegata

#### Scenario: Spento
- **WHEN** l'utente lancia `forgia off`
- **THEN** nessun hook invia eventi finché non lancia `forgia on`

### Requirement: Stato della configurazione
`forgia status [--json]` MUST mostrare l'area della cwd (committente, progetto, URL, token mascherato,
raggiungibilità del server), l'elenco delle aree, se il tracciamento è acceso e l'ultima sessione vista
per la cwd. Con `--json` MUST dire anche se la cwd sta in un'area.

#### Scenario: Token mascherato
- **WHEN** l'utente lancia `forgia status`
- **THEN** ogni token compare solo con le ultime 4 cifre

### Requirement: Avviso se non configurato
Se il plugin non ha nessuna area, l'avvio della sessione MUST non iniettare contesto e MUST al massimo
mostrare all'utente, una volta al giorno, `cantiere forgia: nessuna cartella collegata, lancia
/cantiere collega <progetto>`. Con almeno un'area, fuori dalle aree MUST non mostrare nulla.

#### Scenario: Due avvii nello stesso giorno
- **WHEN** il plugin non ha aree e l'utente apre due sessioni nello stesso giorno
- **THEN** l'avviso compare solo nella prima e Claude non riceve contesto
