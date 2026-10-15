# plugin/resoconto Specification

## Purpose
Garantisce che dopo un turno con lavoro vero Claude mandi il resoconto semantico con
`aggiorna_stato`, bloccando lo `Stop` una volta sola e solo quando serve davvero, e registra sul
server ogni decisione per misurarne il costo.

## Requirements

### Requirement: Mai due blocchi di fila
Se lo `Stop` arriva con `stop_hook_active: true`, il plugin MUST inviare `stop` con `bloccato: false` e
uscire senza bloccare.

#### Scenario: Stop dopo un blocco
- **WHEN** lo `Stop` arriva con `stop_hook_active: true`
- **THEN** il turno si chiude e il server riceve `stop` con `bloccato: false`

### Requirement: Conteggio dal transcript locale
Il plugin MUST leggere il transcript locale dall'ultimo messaggio reale dell'utente (non un risultato di
tool) e contare i `tool_use` escludendo `TodoWrite`, i tool `Task*` e i tool `mcp__<nome_server_mcp>__*`.
`resoconto_inviato` MUST essere vero se nel turno c'è un `tool_use` di `mcp__<nome_server_mcp>__aggiorna_stato`.

#### Scenario: Turno con lavoro
- **WHEN** nel turno ci sono 2 `Read`, 1 `Edit`, 1 `TaskUpdate` e 1 `mcp__forgia__stato_sessione`
- **THEN** `strumenti_nel_turno` è 3

#### Scenario: Resoconto già mandato
- **WHEN** nel turno c'è una chiamata a `mcp__forgia__aggiorna_stato`
- **THEN** `resoconto_inviato` è vero

### Requirement: Lettura difensiva del transcript
Un transcript mancante, troncato, con righe non JSON o con una forma inattesa MUST non far mai
bloccare lo `Stop`: in quei casi il plugin MUST considerare il conteggio non affidabile e non bloccare.

#### Scenario: Riga corrotta
- **WHEN** il transcript contiene una riga che non è JSON
- **THEN** l'hook non blocca e invia comunque `stop`

### Requirement: Condizioni di blocco
Il plugin MUST bloccare lo `Stop` solo se valgono tutte: modalità `forzato` (config locale, altrimenti
l'ultima ricevuta dal server, altrimenti `forzato`); strumenti contati ≥ `soglia_strumenti`; resoconto
non inviato; tool MCP disponibili, cioè avvio reale della sessione successivo alla registrazione MCP.
Con `leggero` e `off` MUST non bloccare mai.

#### Scenario: Turno grosso senza resoconto
- **WHEN** modalità `forzato`, soglia 3, 5 strumenti contati, nessun `aggiorna_stato`, sessione avviata dopo la registrazione MCP
- **THEN** lo `Stop` è bloccato

#### Scenario: Sotto soglia
- **WHEN** gli strumenti contati sono 2 con soglia 3
- **THEN** lo `Stop` non è bloccato

#### Scenario: MCP non ancora caricato
- **WHEN** il setup è stato fatto in questa sessione, quindi la registrazione MCP è successiva all'avvio
- **THEN** lo `Stop` non è bloccato

#### Scenario: Modalità leggera
- **WHEN** la config locale ha `modalita_resoconto: "leggero"` e il server dice `forzato`
- **THEN** lo `Stop` non è bloccato

### Requirement: Messaggio di blocco
Quando blocca, il plugin MUST rispondere a Claude Code con
`{"decision": "block", "reason": "[forgia] Prima di chiudere chiama aggiorna_stato (session_id=<id>): fatto, prossimo, bloccato_da in frasi brevi. Poi termina senza ripetere la risposta."}`.

#### Scenario: Blocco
- **WHEN** valgono tutte le condizioni di blocco per la sessione `abc`
- **THEN** l'output dell'hook contiene `"decision": "block"` e un `reason` con `session_id=abc`

### Requirement: Stop sempre registrato
Ogni `Stop` MUST inviare `stop` con `strumenti_nel_turno`, `resoconto_inviato` e il valore reale di
`bloccato`.

#### Scenario: Stop senza blocco
- **WHEN** il turno finisce con 1 strumento e nessun resoconto
- **THEN** il server riceve `stop` con `strumenti_nel_turno: 1`, `resoconto_inviato: false`, `bloccato: false`
