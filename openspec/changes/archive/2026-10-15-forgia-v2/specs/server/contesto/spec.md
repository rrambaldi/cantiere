# Spec Delta

## ADDED Requirements

### Requirement: Contesto all'avvio nel progetto
Per ogni `session_start` `contesto` MUST essere questo testo, con i valori della sessione e del suo
progetto. Le righe tra parentesi quadre MUST comparire solo alla condizione indicata, e `Regole:`
MUST mancare se non resta nessuna regola.

```
[forgia] session_id=<id>
Progetto: <committente>/<progetto>
Cantiere: <percorso> (<origine>) | nessuno, lavoro diretto sul progetto
Cantieri aperti: <percorsi> | nessuno
Idee: <percorsi> | nessuna
[se ci sono abbandonati da archiviare] Da archiviare: <change>
Regole:
[se lavoro diretto] - Al primo messaggio dell'utente, prima di rispondere, chiedi con una domanda a scelta dove va questa sessione: un cantiere aperto, un'idea (si prende con /cantiere prendi <percorso>), un cantiere nuovo (apri_cantiere con origine "utente"), oppure lavoro diretto sul progetto.
[se ci sono abbandonati da archiviare] - Proponi all'utente di archiviare <change> con: openspec archive <change> --skip-specs --yes
- Prima di chiudere un turno in cui hai lavorato, chiama aggiorna_stato: fatto, prossimo, bloccato_da. Frasi brevi; mai segreti, dati personali o dati dei clienti.
```

#### Scenario: Sessione nuova in un progetto
- **WHEN** parte una sessione `abc` in `CVSTUDIO/poker`, con il cantiere aperto `pdfconverter` e l'idea `idoc-converter`
- **THEN** `contesto` ha le righe `Progetto: CVSTUDIO/poker`, `Cantiere: nessuno, lavoro diretto sul progetto`, `Cantieri aperti: pdfconverter`, `Idee: idoc-converter` e la regola della domanda iniziale

#### Scenario: Ripresa di una sessione in un cantiere
- **WHEN** arriva `session_start` con `source: "resume"` per una sessione associata a `idoc-converter/prototipo` con origine `utente`
- **THEN** la terza riga è `Cantiere: idoc-converter/prototipo (utente)` e la regola della domanda iniziale non c'è

#### Scenario: Abbandonato da archiviare
- **WHEN** in `poker` il cantiere `vecchio-parser` è abbandonato e il suo change è ancora tra gli attivi
- **THEN** `contesto` ha `Da archiviare: vecchio-parser` e la regola che propone `openspec archive vecchio-parser --skip-specs --yes`

### Requirement: Elenchi corti nel contesto
Le righe `Cantieri aperti` e `Idee` MUST elencare al massimo 10 percorsi ciascuna, dai più recenti,
seguiti da `e altri <n>` se ce ne sono di più.

#### Scenario: Molti cantieri aperti
- **WHEN** il progetto ha 13 cantieri aperti
- **THEN** la riga `Cantieri aperti` ha i 10 più recenti seguiti da `e altri 3`

### Requirement: Avviso di cantiere non più aperto
Per il primo `prompt` dopo che il cantiere della sessione è stato sospeso, abbandonato o completato,
`contesto` MUST essere `[forgia] Il cantiere <percorso> è <stato>: ora lavori direttamente su
<progetto>. Dillo all'utente in una riga.` Negli altri casi un `prompt` MUST avere `contesto` null.

#### Scenario: Sospeso dalla dashboard
- **WHEN** la dashboard sospende `export-pdf` e poi arriva un `prompt` di una sessione che ci lavorava
- **THEN** `contesto` è `[forgia] Il cantiere export-pdf è sospeso: ora lavori direttamente su poker. Dillo all'utente in una riga.`

#### Scenario: Prompt normale
- **WHEN** arriva un `prompt` su una sessione il cui cantiere è aperto
- **THEN** `contesto` è null

### Requirement: Conferma dell'apertura da comando
Per `apri_cantiere` ricevuto come evento, `contesto` MUST essere `[forgia] Comando /cantiere gestito:
cantiere "<percorso>" aperto (change <change>). Rispondi all'utente con una sola riga di conferma.`
Il prefisso `[forgia] Comando /cantiere gestito` MUST restare invariato.

#### Scenario: Apertura da comando
- **WHEN** arriva l'evento `apri_cantiere` con nome `idoc-converter/preprod`
- **THEN** `contesto` è `[forgia] Comando /cantiere gestito: cantiere "idoc-converter/preprod" aperto (change idoc-converter-preprod). Rispondi all'utente con una sola riga di conferma.`

## MODIFIED Requirements

### Requirement: Regola del resoconto omessa con modalità off
Con `modalita_resoconto = off` il contesto di avvio MUST omettere l'ultima regola (quella su
`aggiorna_stato`).

#### Scenario: Modalità off
- **WHEN** il server è configurato con `modalita_resoconto = "off"` e arriva un `session_start` per una sessione già in un cantiere
- **THEN** il contesto non ha la riga `Regole:` e non nomina `aggiorna_stato`

## REMOVED Requirements

### Requirement: Contesto all'avvio della sessione
**Reason**: il contesto di avvio ora dice progetto, cantieri aperti e idee, e la regola sul cantiere
provvisorio non ha più senso.
**Migration**: requisito "Contesto all'avvio nel progetto".

### Requirement: Hint del cantiere provvisorio sui prompt
**Reason**: i cantieri provvisori spariscono; la scelta del cantiere avviene una volta, al primo
messaggio.
**Migration**: regola della domanda iniziale nel contesto di avvio; sui prompt resta solo l'avviso di
cantiere non più aperto.

### Requirement: Conferma dei comandi ricevuti come eventi
**Reason**: l'evento `chiudi_cantiere` sparisce.
**Migration**: requisito "Conferma dell'apertura da comando", con lo stesso prefisso.

### Requirement: Conferma della chiusura forzata
**Reason**: la chiusura da Claude Code sparisce.
**Migration**: l'abbandono di un padre si conferma dalla dashboard.
