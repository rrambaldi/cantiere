# plugin/configurazione Specification

## Purpose
Porta il plugin forgia da installato a funzionante con un solo setup: URL e token verificati,
configurazione salvata a livello utente, tool MCP che valgono subito, e da lì tracciamento sempre
attivo finché l'utente non lo spegne.

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
Windows `%APPDATA%\forgia\config.json`) con permessi 0600, con i campi `abilitato`,
`modalita_resoconto` (null = quella del server) e `aree`: per ognuna `cartella`, `url`, `token`,
`committente`, `progetto`.

#### Scenario: Permessi
- **WHEN** il collegamento finisce su Linux
- **THEN** `~/.config/forgia/config.json` ha permessi 0600

#### Scenario: Stessa cartella collegata di nuovo
- **WHEN** `~/lavori/poker` è già un'area e si lancia di nuovo `forgia collega poker` con un altro token
- **THEN** la configurazione ha una sola area per `~/lavori/poker`, con il token nuovo

### Requirement: Server MCP dichiarato dal plugin
Il plugin MUST dichiarare in `plugin.json` il server MCP `forgia`, lanciato con `node
${CLAUDE_PLUGIN_ROOT}/bin/forgia.mjs mcp`: in Claude Code i suoi tool si chiamano
`mcp__plugin_forgia_forgia__<tool>`. Il collegamento MUST NOT registrare server MCP: MUST togliere la
vecchia registrazione per cartella (`claude mcp remove forgia --scope local`), ignorando l'errore di una
registrazione che non c'è, e dire che i tool valgono subito. Il token MUST NOT finire nei comandi `claude` né nell'output.

#### Scenario: Vecchia registrazione per cartella
- **WHEN** si collega `~/lavori/poker`, che ha ancora il server MCP `forgia` registrato per cartella
- **THEN** il collegamento lancia `claude mcp remove forgia --scope local` in `~/lavori/poker`, salva l'area e dice che i tool `mcp__plugin_forgia_forgia__*` li dà il plugin e valgono subito

#### Scenario: Claude Code non nel PATH
- **WHEN** il comando `claude` non si trova
- **THEN** il collegamento salva comunque l'area, dice di togliere a mano un vecchio server `forgia` con `claude mcp remove forgia --scope local` ed esce senza errori, senza il token nell'output

### Requirement: Permessi per i tool MCP e la lettura su richiesta
Il setup MUST proporre `/cantiere permessi`, senza aggiungere permessi da solo. Solo `forgia
permetti-mcp` (che `/cantiere permessi` lancia) MUST unire a `~/.claude/settings.json` le regole
`mcp__plugin_forgia_forgia`, `mcp__forgia`, `Bash(forgia cerca:*)` e `Bash(forgia leggi:*)` che
mancano, dopo averne fatto un backup, senza mai sovrascrivere le altre impostazioni. Se ci sono già
tutte MUST dirlo e non toccare il file.

#### Scenario: Utente accetta
- **WHEN** l'utente lancia `/cantiere permessi` e `settings.json` ha già `Bash(git status)` e `mcp__forgia`
- **THEN** il file ha `Bash(git status)`, `mcp__forgia`, `mcp__plugin_forgia_forgia`, `Bash(forgia cerca:*)` e `Bash(forgia leggi:*)`, le altre impostazioni di prima, e accanto c'è il backup

#### Scenario: Regole già presenti
- **WHEN** l'utente lancia di nuovo `/cantiere permessi`
- **THEN** il comando dice che le regole ci sono già e non fa un altro backup

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
