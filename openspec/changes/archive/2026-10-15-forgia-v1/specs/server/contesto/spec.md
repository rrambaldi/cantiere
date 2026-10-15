# Spec Delta

## Purpose

Definisce il testo di `contesto` che il server compone e il plugin inietta così com'è nel contesto
di Claude: corto, perché ogni riga costa token in ogni sessione, e con prefissi stabili che il
plugin riconosce.

## ADDED Requirements

### Requirement: Contesto all'avvio della sessione
Per ogni `session_start`, di qualunque `source`, `contesto` MUST essere questo testo, con i valori
della sessione:

```
[forgia] session_id=<id>
Cantiere: <percorso> (<origine>, <confermato|provvisorio>)
Regole:
- Cantiere provvisorio e lavoro chiaramente diverso? Chiama apri_cantiere (server MCP forgia, origine "claude") con un nome breve e specifico.
- Se l'utente cambia argomento in modo netto, fai lo stesso.
- Prima di chiudere un turno in cui hai lavorato, chiama aggiorna_stato: fatto, prossimo, bloccato_da. Frasi brevi; mai segreti, dati personali o dati dei clienti.
```

#### Scenario: Avvio con cantiere provvisorio
- **WHEN** arriva `session_start` per la sessione `abc` e il server la associa al cantiere `app@main` con origine `auto`
- **THEN** `contesto` inizia con `[forgia] session_id=abc` e la seconda riga è `Cantiere: app@main (auto, provvisorio)`

#### Scenario: Avvio con cantiere confermato
- **WHEN** la sessione è associata a `oauth-logiquo` con origine `utente`
- **THEN** la seconda riga è `Cantiere: oauth-logiquo (utente, confermato)`

#### Scenario: Avvio in un cantiere figlio
- **WHEN** la sessione è associata a `oauth`, figlio di `logiquo-v2`, con origine `utente`
- **THEN** la seconda riga è `Cantiere: logiquo-v2/oauth (utente, confermato)`

### Requirement: Regola del resoconto omessa con modalità off
Con `modalita_resoconto = off` il contesto di avvio MUST omettere l'ultima regola (quella su
`aggiorna_stato`).

#### Scenario: Modalità off
- **WHEN** il server è configurato con `modalita_resoconto = "off"` e arriva un `session_start`
- **THEN** il contesto ha due regole e non nomina `aggiorna_stato`

### Requirement: Hint del cantiere provvisorio sui prompt
Per un `prompt`, `contesto` MUST essere `[forgia] Cantiere provvisorio: <nome>. Se non corrisponde al
lavoro, apri_cantiere.` solo se il cantiere della sessione è provvisorio e la sessione ha ricevuto
meno di `hint_max` hint; ogni hint inviato MUST contare. Negli altri casi MUST essere null.

#### Scenario: Primi prompt su un provvisorio
- **WHEN** con `hint_max = 3` arrivano 4 `prompt` su una sessione con cantiere provvisorio
- **THEN** i primi 3 hanno l'hint e il quarto ha `contesto: null`

#### Scenario: Cantiere confermato
- **WHEN** arriva un `prompt` su una sessione con cantiere confermato
- **THEN** `contesto` è null

### Requirement: Conferma dei comandi ricevuti come eventi
Per `apri_cantiere` ricevuto come evento, `contesto` MUST essere `[forgia] Comando /cantiere gestito:
cantiere "<nome>" aperto (id <id>). Rispondi all'utente con una sola riga di conferma.` Per
`chiudi_cantiere`, lo stesso testo con `chiuso (esito <esito>)`. Il prefisso `[forgia] Comando /cantiere
gestito` MUST restare invariato.

#### Scenario: Apertura da comando
- **WHEN** arriva l'evento `apri_cantiere` con nome `oauth-logiquo` e il cantiere ha id 12
- **THEN** `contesto` è `[forgia] Comando /cantiere gestito: cantiere "oauth-logiquo" aperto (id 12). Rispondi all'utente con una sola riga di conferma.`

#### Scenario: Chiusura da comando
- **WHEN** arriva l'evento `chiudi_cantiere` con esito `sospeso` sul cantiere `oauth-logiquo`
- **THEN** `contesto` inizia con `[forgia] Comando /cantiere gestito: cantiere "oauth-logiquo" chiuso (esito sospeso)`

### Requirement: Nessun contesto per gli altri tipi
Per `todo`, `stop` e `session_end` `contesto` MUST essere null.

#### Scenario: Todo
- **WHEN** arriva un evento `todo`
- **THEN** `contesto` è null

### Requirement: Conferma della chiusura forzata
Quando `chiudi_cantiere` con `forza` chiude anche dei discendenti, la riga di conferma MUST elencarli dopo
l'esito: `... chiuso (esito <esito>), con i figli <a>, <b>. ...`.

#### Scenario: Chiusura forzata da comando
- **WHEN** l'evento `chiudi_cantiere` con `forza: true` chiude `logiquo-v2` e il figlio `oauth`
- **THEN** `contesto` inizia con `[forgia] Comando /cantiere gestito: cantiere "logiquo-v2" chiuso (esito completato), con i figli oauth`
