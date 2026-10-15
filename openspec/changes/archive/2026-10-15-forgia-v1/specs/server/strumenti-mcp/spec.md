# Spec Delta

## Purpose

Espone a Claude, via MCP su `/mcp`, i tool con cui corregge il cantiere, manda il resoconto
semantico del turno e si coordina con le altre sessioni. Anche i client senza hook (per esempio
claude.ai) possono usarli.

## ADDED Requirements

### Requirement: Cinque tool su Streamable HTTP
Il server MUST esporre su `/mcp`, con transport Streamable HTTP e lo stesso Bearer di REST, i tool
`apri_cantiere(session_id, nome, descrizione?, origine="claude", padre?)`,
`aggiorna_stato(session_id, fatto, prossimo, bloccato_da?, percentuale?)`,
`chiudi_cantiere(session_id, esito, nota?, forza=false)`, `elenca_cantieri(repo?, solo_aperti=true)` e
`stato_sessione(session_id)`. Il nome del server MCP MUST essere `forgia`.

#### Scenario: Elenco dei tool
- **WHEN** un client MCP autenticato chiede l'elenco dei tool
- **THEN** riceve esattamente questi cinque tool con i parametri indicati

### Requirement: Stesse regole di REST
I tool MUST applicare le stesse regole di `/api/v1/eventi`: precedenza, apertura per slug, chiusura,
validazione e lunghezze massime. Un `session_id` sconosciuto MUST creare la sessione al volo.
`apri_cantiere` e `chiudi_cantiere` via MCP MUST lasciare traccia nell'archivio degli eventi come
quelli ricevuti via REST.

#### Scenario: Session_id sconosciuto da claude.ai
- **WHEN** un client senza hook chiama `aggiorna_stato` con un `session_id` mai visto
- **THEN** il server crea la sessione, la associa a un cantiere e salva lo stato

### Requirement: Descrizioni in italiano che dicono quando usare il tool
Ogni tool MUST avere una descrizione in italiano che dice quando usarlo e quando no. `apri_cantiere`
MUST dire che l'origine `utente` vale solo se l'utente ha nominato il cantiere nel turno corrente e
che il nome va specifico (`oauth-logiquo`), non generico (`refactoring`). `aggiorna_stato` MUST dire:
massimo ~200 caratteri per campo, niente segreti, dati personali o dati dei clienti, `bloccato_da`
solo se c'è un blocco vero.

#### Scenario: Descrizione di aggiorna_stato
- **WHEN** Claude legge la descrizione di `aggiorna_stato`
- **THEN** trova il limite di ~200 caratteri, il divieto di segreti e dati personali e quando usare `bloccato_da`

### Requirement: Rifiuto chiaro per precedenza
Quando la precedenza impedisce il cambio, `apri_cantiere` MUST restituire un risultato non di errore
che dice a Claude che il cantiere è stato scelto dall'utente e di non insistere. Il cantiere della
sessione MUST restare invariato.

#### Scenario: Claude prova a cambiare cantiere scelto dall'utente
- **WHEN** la sessione è associata dall'utente e Claude chiama `apri_cantiere` con origine `claude`
- **THEN** il tool risponde con un messaggio di rifiuto chiaro che dice di non riprovare, e la sessione resta nel suo cantiere

### Requirement: Storico dei resoconti
`aggiorna_stato` MUST salvare un nuovo stato (fatto, prossimo, bloccato_da, percentuale) nello storico
della sessione e del suo cantiere, senza cancellare i precedenti. `percentuale`, se presente, MUST
stare tra 0 e 100.

#### Scenario: Due resoconti
- **WHEN** Claude chiama `aggiorna_stato` due volte nella stessa sessione
- **THEN** lo storico ha due stati e `stato_sessione` mostra l'ultimo

### Requirement: Coordinamento con elenca_cantieri
`elenca_cantieri` MUST restituire, per ogni cantiere (solo aperti per default, filtrabili per repo), il
`percorso` e le sessioni attive con host, branch, stato, ultimo `fatto` e `prossimo` ed età dell'ultimo evento.

#### Scenario: Due macchine sullo stesso cantiere
- **WHEN** due sessioni da host diversi lavorano su `oauth-logiquo` e una terza sessione chiama `elenca_cantieri`
- **THEN** vede `oauth-logiquo` con le due sessioni, i loro host, branch, stato, ultimo resoconto ed età dell'ultimo evento

### Requirement: Stato della sessione dopo una compattazione
`stato_sessione` MUST restituire cantiere corrente, ultimo stato e todo della sessione.

#### Scenario: Ripresa dopo compact
- **WHEN** Claude chiama `stato_sessione` dopo una compattazione
- **THEN** riceve il cantiere, l'ultimo `fatto`/`prossimo` e la lista dei todo

### Requirement: Risultato strutturato e leggibile
Ogni tool MUST restituire JSON compatto come contenuto strutturato insieme a un breve testo leggibile.

#### Scenario: Risultato di apri_cantiere
- **WHEN** `apri_cantiere` va a buon fine
- **THEN** il risultato ha un oggetto strutturato con il cantiere e una riga di testo di conferma

### Requirement: Rifiuto chiaro per padre e figli
`apri_cantiere` con un padre diverso o un ciclo, e `chiudi_cantiere` senza `forza` su un cantiere con figli
aperti, MUST restituire un risultato non di errore con il motivo. Per la chiusura il motivo MUST elencare i
figli aperti e dire che serve l'ok dell'utente per `forza`. La descrizione di `chiudi_cantiere` MUST dire di
usare `forza` solo se l'utente l'ha chiesto.

#### Scenario: Chiusura di un padre via MCP
- **WHEN** Claude chiama `chiudi_cantiere` senza `forza` su un cantiere con il figlio aperto `oauth`
- **THEN** il tool risponde con `ok: false` e un motivo che nomina `oauth`, e nessun cantiere si chiude
