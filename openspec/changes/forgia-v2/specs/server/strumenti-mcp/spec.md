# Spec Delta

## ADDED Requirements

### Requirement: Quattro tool su Streamable HTTP
Il server MUST esporre su `/mcp`, con transport Streamable HTTP e il Bearer del committente, i tool
`apri_cantiere(session_id, nome, descrizione?, origine="claude", padre?, progetto?)`,
`aggiorna_stato(session_id, fatto, prossimo, bloccato_da?, percentuale?, progetto?)`,
`elenca_cantieri(progetto?, stati?)` e `stato_sessione(session_id)`. Il nome del server MCP MUST
essere `forgia`.

#### Scenario: Elenco dei tool
- **WHEN** un client MCP autenticato chiede l'elenco dei tool
- **THEN** riceve esattamente questi quattro tool con i parametri indicati, e non `chiudi_cantiere`

### Requirement: Progetto nei tool
Per una sessione già nota i tool MUST usare il suo progetto; un `progetto` diverso MUST spostarla come
farebbe un evento. Per una sessione mai vista `progetto` MUST essere obbligatorio, altrimenti il tool
MUST rispondere con un rifiuto che chiede il progetto.

#### Scenario: Claude.ai senza progetto
- **WHEN** un client senza hook chiama `aggiorna_stato` con un `session_id` mai visto e senza `progetto`
- **THEN** il tool risponde con `ok: false` e un motivo che chiede il progetto, e non salva nulla

### Requirement: Rifiuto chiaro per sospesi, idee e nomi presi
`apri_cantiere` su un cantiere `sospeso` o chiuso, su un'idea o con un nome di change già preso MUST
restituire un risultato non di errore con `ok: false` e il motivo: riattivare dalla dashboard, usare
`/cantiere prendi <percorso>`, oppure scegliere un altro nome.

#### Scenario: Idea aperta via MCP
- **WHEN** Claude chiama `apri_cantiere` su `idoc-converter`, che è in stato `idea`
- **THEN** il tool risponde con `ok: false` e un motivo che dice di lanciare `/cantiere prendi idoc-converter`

## MODIFIED Requirements

### Requirement: Stesse regole di REST
I tool MUST applicare le stesse regole di `/api/v1/eventi`: precedenza, apertura per percorso,
validazione e lunghezze massime. Un `session_id` sconosciuto con un `progetto` MUST creare la sessione
al volo. `apri_cantiere` via MCP MUST lasciare traccia nell'archivio degli eventi come quello ricevuto
via REST.

#### Scenario: Session_id sconosciuto da claude.ai
- **WHEN** un client senza hook chiama `aggiorna_stato` con un `session_id` mai visto e `progetto: "mercurius"`
- **THEN** il server crea la sessione in lavoro diretto su `mercurius` e salva lo stato

### Requirement: Descrizioni in italiano che dicono quando usare il tool
Ogni tool MUST avere una descrizione in italiano che dice quando usarlo e quando no. `apri_cantiere`
MUST dire che l'origine `utente` vale solo se l'utente ha scelto o nominato il cantiere nel turno
corrente, che il nome va specifico (`pdfconverter`), non generico (`refactoring`), che il percorso
parte dal primo livello del progetto e che, se il change non esiste, va creato con `openspec new change
<change>`. `aggiorna_stato` MUST dire: massimo ~200 caratteri per campo, niente segreti, dati personali
o dati dei clienti, `bloccato_da` solo se c'è un blocco vero.

#### Scenario: Descrizione di aggiorna_stato
- **WHEN** Claude legge la descrizione di `aggiorna_stato`
- **THEN** trova il limite di ~200 caratteri, il divieto di segreti e dati personali e quando usare `bloccato_da`

#### Scenario: Descrizione di apri_cantiere
- **WHEN** Claude legge la descrizione di `apri_cantiere`
- **THEN** trova quando usare l'origine `utente`, che il percorso parte dal primo livello del progetto e il comando per creare il change mancante

### Requirement: Storico dei resoconti
`aggiorna_stato` MUST salvare un nuovo stato (fatto, prossimo, bloccato_da, percentuale) nello storico
della sessione e del suo cantiere, o del suo progetto se la sessione è in lavoro diretto, senza
cancellare i precedenti. `percentuale`, se presente, MUST stare tra 0 e 100.

#### Scenario: Due resoconti
- **WHEN** Claude chiama `aggiorna_stato` due volte nella stessa sessione
- **THEN** lo storico ha due stati e `stato_sessione` mostra l'ultimo

#### Scenario: Resoconto nel lavoro diretto
- **WHEN** una sessione in lavoro diretto su `poker` chiama `aggiorna_stato`
- **THEN** lo stato è salvato nello storico della sessione e di `poker`, senza cantiere

### Requirement: Coordinamento con elenca_cantieri
`elenca_cantieri` MUST restituire solo i cantieri del committente del token (tutti i progetti, o quello
indicato; per default negli stati `idea`, `aperto` e `sospeso`), ciascuno con progetto, `percorso`,
stato, change e avanzamento, e le sessioni attive con host, branch, stato, ultimo `fatto` e `prossimo`
ed età dell'ultimo evento.

#### Scenario: Due macchine sullo stesso cantiere
- **WHEN** due sessioni da host diversi lavorano su `poker/pdfconverter` e una terza sessione chiama `elenca_cantieri`
- **THEN** vede `pdfconverter` con le due sessioni, i loro host, branch, stato, ultimo resoconto ed età dell'ultimo evento

#### Scenario: Idee nell'elenco
- **WHEN** `poker` ha l'idea `idoc-converter` e Claude chiama `elenca_cantieri(progetto: "poker")`
- **THEN** il risultato ha `idoc-converter` in stato `idea`

### Requirement: Stato della sessione dopo una compattazione
`stato_sessione` MUST restituire progetto, cantiere corrente con il suo change (o null per il lavoro
diretto), ultimo stato e todo della sessione.

#### Scenario: Ripresa dopo compact
- **WHEN** Claude chiama `stato_sessione` dopo una compattazione
- **THEN** riceve progetto, cantiere e change, l'ultimo `fatto`/`prossimo` e la lista dei todo

## REMOVED Requirements

### Requirement: Cinque tool su Streamable HTTP
**Reason**: `chiudi_cantiere` sparisce e i tool prendono il progetto.
**Migration**: requisito "Quattro tool su Streamable HTTP".

### Requirement: Rifiuto chiaro per padre e figli
**Reason**: il cambio di padre non esiste più e la chiusura da Claude Code sparisce.
**Migration**: requisito "Rifiuto chiaro per sospesi, idee e nomi presi".
